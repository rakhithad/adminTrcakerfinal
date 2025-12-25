import axios from 'axios';
import { supabase, refreshSessionIfNeeded, isSessionValid } from '../supabaseClient';
import { saveAs } from 'file-saver';

// Generate a unique request ID for tracking
const generateRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api',
  timeout: 30000, // 30 second timeout
  withCredentials: false, // We use Bearer tokens, not cookies
});

// Track if we're currently refreshing to prevent race conditions
let isRefreshing = false;
let refreshSubscribers = [];

// Subscribe to token refresh
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

// Notify all subscribers when token is refreshed
const onTokenRefreshed = (token) => {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
};

// Notify subscribers of refresh failure
const onRefreshFailed = (error) => {
  refreshSubscribers.forEach(callback => callback(null, error));
  refreshSubscribers = [];
};

// Request interceptor - adds auth token and request ID to every request
api.interceptors.request.use(
  async (config) => {
    // Add unique request ID for tracking/debugging
    config.headers['X-Request-ID'] = generateRequestId();
    
    // Add X-Requested-With header for CSRF-like protection
    // This header cannot be set by cross-origin requests without CORS preflight
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if session is still valid (not expired or about to expire)
        if (isSessionValid(session)) {
          config.headers['Authorization'] = `Bearer ${session.access_token}`;
        } else {
          // Session is about to expire, try to refresh before the request
          const { session: newSession, error } = await refreshSessionIfNeeded();
          if (newSession && !error) {
            config.headers['Authorization'] = `Bearer ${newSession.access_token}`;
          } else if (error) {
            // Can't refresh, let the request go through - it will fail with 401
            // and the response interceptor will handle redirect
            console.warn('Session refresh failed, proceeding with expired token');
            config.headers['Authorization'] = `Bearer ${session.access_token}`;
          }
        }
      }
    } catch (error) {
      // Don't block request on session errors, let server handle auth
      console.warn('Error getting session for request');
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handles token expiration and refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle network errors gracefully
    if (!error.response) {
      console.error('Network error - unable to reach server');
      return Promise.reject(new Error('Unable to connect to server. Please check your connection.'));
    }
    
    // If the error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // If already refreshing, wait for the refresh to complete
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token, refreshError) => {
            if (refreshError || !token) {
              reject(new Error('Session expired. Please login again.'));
            } else {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
              resolve(api(originalRequest));
            }
          });
        });
      }
      
      isRefreshing = true;
      
      try {
        // Attempt to refresh the session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !session) {
          isRefreshing = false;
          onRefreshFailed(refreshError || new Error('No session'));
          
          // Refresh failed - sign out the user
          await supabase.auth.signOut();
          
          // Use a flag to prevent redirect loops
          if (!window.__authRedirecting) {
            window.__authRedirecting = true;
            window.location.href = '/auth';
          }
          return Promise.reject(new Error('Session expired. Please login again.'));
        }
        
        isRefreshing = false;
        
        // Notify all waiting requests
        onTokenRefreshed(session.access_token);
        
        // Update the Authorization header with new token
        originalRequest.headers['Authorization'] = `Bearer ${session.access_token}`;
        
        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed(refreshError);
        
        // If refresh fails, sign out
        await supabase.auth.signOut();
        
        if (!window.__authRedirecting) {
          window.__authRedirecting = true;
          window.location.href = '/auth';
        }
        return Promise.reject(new Error('Session expired. Please login again.'));
      }
    }
    
    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 60;
      return Promise.reject(new Error(`Too many requests. Please try again in ${retryAfter} seconds.`));
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      return Promise.reject(new Error('You do not have permission to perform this action.'));
    }
    
    // For other errors, use server message if available, otherwise generic
    // Server uses 'error' field for error messages, fallback to 'message' for compatibility
    const serverMessage = error.response?.data?.error || error.response?.data?.message;
    const safeMessage = serverMessage || 'An error occurred. Please try again.';
    
    return Promise.reject(new Error(safeMessage));
  }
);

export const createPendingBooking = async (bookingData) => {
  return await api.post('/bookings/pending', bookingData);
};

export const getPendingBookings = async () => {
  return await api.get('/bookings/pending');
};

export const approveBooking = async (bookingId) => {
  return await api.post(`/bookings/pending/${bookingId}/approve`);
};

export const rejectBooking = async (bookingId) => {
  return await api.post(`/bookings/pending/${bookingId}/reject`);
};

export const createBooking = async (bookingData) => {
  return await api.post('/bookings', bookingData);
};

export const getBookings = async () => {
  return await api.get('/bookings');
};

export const updateBooking = async (id, updates) => {
  return await api.put(`/bookings/${id}`, updates);
};

export const updatePendingBooking = async (bookingId, updates) => {
  return await api.put(`/bookings/pending/${bookingId}`, updates);
};

export const getDashboardStats = async () => {
  return await api.get('/bookings/dashboard/stats');
};

export const getAttentionBookings = async () => {
  return await api.get('/bookings/dashboard/attention-bookings');
};

export const getOverdueBookings = async () => {
  return await api.get('/bookings/dashboard/overdue-bookings');
};


export const getRecentBookings = async () => {
  return await api.get('/bookings/dashboard/recent');
};

export const getCustomerDeposits = async () => {
  return await api.get('/bookings/customer-deposits');
};

export const updateInstalment = async (id, data) => {
  return await api.patch(`/bookings/instalments/${id}`, data);
};


export const getSuppliersInfo = async () => {
  return await api.get('/bookings/suppliers-info');
};

export const createSupplierPaymentSettlement = async (data) => {
  return await api.post('/bookings/suppliers/settlements', data);
};

export const recordSettlementPayment = async (bookingId, paymentData) => {
  return await api.post(`/bookings/${bookingId}/record-settlement-payment`, paymentData);
};

export const getTransactions = async () => {
  return await api.get('/bookings/transactions');
};

export const createCancellation = async (originalBookingId, data) => {
  return await api.post(`/bookings/${originalBookingId}/cancel`, data);
};

export const getAvailableCreditNotes = async (supplier) => {
  return await api.get(`/bookings/credit-notes/available/${supplier}`);
};

export const createDateChangeBooking = async (originalBookingId, bookingData) => {
  return await api.post(`/bookings/${originalBookingId}/date-change`, bookingData);
};

export const createSupplierPayableSettlement = async(data) => {
  return await api.post(`/bookings/supplier-payable/settle`, data);
}

export const settleCustomerPayable = async(payableId, data) => {
  return await api.post(`/bookings/customer-payable/${payableId}/settle`, data);
}

export const recordPassengerRefund = async(cancellationId, data) => {
  return await api.post(`/bookings/cancellations/${cancellationId}/record-refund`, data);
}

export const voidBooking = async (bookingId, reason) => {
  return await api.post(`/bookings/${bookingId}/void`, { reason });
};

export const unvoidBooking = async (bookingId) => {
  return await api.post(`/bookings/${bookingId}/unvoid`);
};





export const createUser = async (userData) => {
  return await api.post('/users/create', userData);
};

export const getMyProfile = () => {
    return api.get('/users/me');
};
export const updateMyProfile = (profileData) => {
    return api.put('/users/me', profileData);
};

export const getAgentsList = () => {
  return api.get('/users/agents'); 
};

export const getAllUsers = async () => {
  return await api.get('/users');
};

export const updateUserById = async (userId, userData) => {
  return await api.put(`/users/${userId}`, userData);
};


//audit history
export const getAuditHistory = (modelName, recordId) => {
    return api.get(`/audit-history?modelName=${modelName}&recordId=${recordId}`);
};


export const generateInvoicePDF = async (bookingId, invoiceNumber) => {
  try {
    const response = await api.post(`/bookings/${bookingId}/invoice`, {}, {
      responseType: 'blob', // Important: we expect a file back
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    // Use the invoiceNumber from the response if available, otherwise create a new one
    const contentDisposition = response.headers['content-disposition'];
    let fileName = `invoice-${invoiceNumber || 'download'}.pdf`;
    if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch && fileNameMatch.length === 2)
            fileName = fileNameMatch[1];
    }
    
    saveAs(blob, fileName);
    
    return { success: true };
  } catch (error) {
    // Don't log the full error object which may contain sensitive data
    console.error("Error generating invoice PDF");
    return { success: false, message: error.message || "Could not generate PDF." };
  }
};

export const getInternalInvoicingReport = async () => {
  return await api.get('/reports/internal-invoicing');
};

export const createInternalInvoice = async (data) => {
    // data can be { bookingId, amount, invoiceDate, commissionAmount? }
    try {
        const response = await api.post('/reports/internal-invoicing', data, {
            responseType: 'blob', // Expect a PDF file back
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        // Extract filename from headers if possible
        const contentDisposition = response.headers['content-disposition'];
        let fileName = 'commission-receipt.pdf';
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
        }
        saveAs(blob, fileName);
        return { success: true };
    } catch (error) {
        console.error("Error creating internal invoice");
        return { success: false, message: error.message || "Could not generate PDF receipt." };
    }
};

export const updateInternalInvoice = async (invoiceId, data) => {
  // data should be { amount, invoiceDate }
  return await api.put(`/reports/internal-invoicing/${invoiceId}`, data);
};

export const getInvoiceHistoryForBooking = async (recordId, recordType) => {
  return await api.get(`/reports/internal-invoicing/${recordType}/${recordId}/history`);
};


export const updateCommissionAmount = async (recordId, recordType, commissionAmount) => {
  return await api.put(`/reports/internal-invoicing/commission-amount`, { 
    recordId, 
    recordType, 
    commissionAmount 
  });
};

export const downloadInvoiceReceipt = async (invoiceId, folderNo) => {
    try {
        const response = await api.get(`/reports/internal-invoicing/${invoiceId}/pdf`, {
            responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        saveAs(blob, `commission-receipt-${folderNo}-${invoiceId}.pdf`);
        return { success: true };
    } catch (error) {
        console.error("Error downloading receipt");
        return { success: false, message: error.message || "Could not download PDF." };
    }
};

export const updateRecordAccountingMonth = async (recordId, recordType, accountingMonth) => {
  return await api.put('/reports/internal-invoicing/accounting-month', {
    recordId,
    recordType,
    accountingMonth,
  });
};

export const generateCommissionSummaryPDF = async (filters) => {
    try {
        const response = await api.post('/reports/internal-invoicing/summary-pdf', filters, {
            responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        saveAs(blob, 'commission-summary-report.pdf');
        return { success: true };
    } catch (error) {
        console.error("Error generating summary PDF");
        return { success: false, message: error.message };
    }
};

export const generateTransactionReportPDF = async (filters) => {
    try {
        const response = await api.post('/transactions/summary-pdf', filters, {
            responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        saveAs(blob, 'transaction-report.pdf');
        return { success: true };
    } catch (error) {
        console.error("Error generating transaction PDF");
        return { success: false, message: error.message };
    }
};

export const generateSupplierReportPDF = async (filters) => {
    try {
        const response = await api.post('/supplier-reports/pdf', filters, {
            responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        saveAs(blob, 'supplier-report.pdf');
        return { success: true };
    } catch (error) {
        console.error("Error generating supplier report PDF");
        return { success: false, message: error.message };
    }
};

export const generateCustomerDepositReportPDF = async (filters) => {
    try {
        const response = await api.post('/reports/customer-deposits', filters, {
            responseType: 'blob', // IMPORTANT: This tells axios to expect a file
        });
        
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const filename = `Customer-Deposit-Report-${new Date().toISOString().split('T')[0]}.pdf`;
        
        saveAs(blob, filename); // Uses file-saver to trigger download
        
        return { success: true };
    } catch (error) {
        console.error("Error generating customer deposit report PDF");
        return { success: false, message: error.message || "Could not generate PDF report." };
    }
};

export const getCustomerCreditNotes = async (originalBookingId) => {
  return await api.get(`/bookings/credit-notes/customer`, { 
    params: { originalBookingId } // Changed parameter name
  });
};