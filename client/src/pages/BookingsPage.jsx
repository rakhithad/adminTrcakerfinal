import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaSearch, FaSpinner, FaExclamationTriangle, FaFolderOpen, FaSort, 
  FaSortUp, FaSortDown, FaChevronRight, FaChevronDown, FaFileInvoiceDollar,
  FaHandHoldingUsd, FaReceipt, FaHistory, FaUndo 
} from 'react-icons/fa';
import { getBookings } from '../api/api';
import BookingDetailsPopup from '../components/BookingDetailsPopup';

const COLORS = {
  primaryBlue: '#2D3E50',
  secondaryBlue: '#0A738A',
  accentYellow: '#F2C144',
  accentOrange: '#F08A4B',
  accentRed: '#E05B5B',
  lightGray: '#F9FAFB',
  mediumGray: '#EDF2F7',
  darkGrayText: '#374151',
  successGreen: '#10B981',
  errorRed: '#EF4444',
};

const compareFolderNumbers = (a, b) => {
  if (!a || !b) return 0;
  const partsA = a.toString().split('.').map(part => parseInt(part, 10));
  const partsB = b.toString().split('.').map(part => parseInt(part, 10));
  const mainA = partsA[0];
  const mainB = partsB[0];
  if (mainA !== mainB) return mainA - mainB;
  const subA = partsA.length > 1 ? partsA[1] : 0;
  const subB = partsB.length > 1 ? partsB[1] : 0;
  return subA - subB;
};

const AmendmentHistory = ({ amendments, currentTotals }) => {
  const renderDiff = (field, difference, isReversed) => {
    if (isReversed) return <span className="text-gray-400 line-through">Reversed</span>;
    const diff = parseFloat(difference);
    if (diff === 0 || isNaN(diff)) return <span className="text-gray-400">-</span>;

    let isGood = diff > 0;
    const fieldLower = field.toLowerCase();
    if (fieldLower.includes('cost') || fieldLower.includes('surcharge') || fieldLower.includes('fee')) {
      isGood = diff < 0;
    }

    return (
      <span className={`flex items-center gap-1 font-bold text-xs ${isGood ? 'text-green-600' : 'text-red-500'}`}>
        {diff > 0 ? <FaSortUp className="mt-1" /> : <FaSortDown className="-mt-1" />}
        £{Math.abs(diff).toFixed(2)}
      </span>
    );
  };

  if (!amendments || amendments.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm italic bg-gray-50 border-t border-gray-200">
        No amendment history recorded for this booking.
      </div>
    );
  }

  const formatMoney = (val) => parseFloat(val || 0).toFixed(2);
  const profitColor = parseFloat(currentTotals?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-500';
  const balanceColor = parseFloat(currentTotals?.balance || 0) > 0 ? 'text-red-500' : 'text-green-600';

  return (
    <div className="bg-gray-50 p-4 border-t-4 border-double border-gray-200">
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
            <FaHistory style={{ color: COLORS.secondaryBlue }} />
            <h4 className="text-sm font-bold uppercase tracking-wider text-gray-700">Audit & Amendment Log</h4>
        </div>
        
        <div className="flex items-center gap-3 text-xs bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm ml-auto">
             <span className="text-gray-400 font-bold uppercase text-[10px] tracking-wide">Financial Snapshot:</span>
             <div className="flex items-center gap-1">
                <span className="text-gray-500">Revenue:</span>
                <span className="font-bold text-gray-800">£{formatMoney(currentTotals?.revenue)}</span>
             </div>
             <div className="w-px h-3 bg-gray-300 mx-1"></div>
             <div className="flex items-center gap-1">
                <span className="text-gray-500">Balance:</span>
                <span className={`font-bold ${balanceColor}`}>£{formatMoney(currentTotals?.balance)}</span>
             </div>
             <div className="w-px h-3 bg-gray-300 mx-1"></div>
             <div className="flex items-center gap-1">
                <span className="text-gray-500">Profit:</span>
                <span className={`font-bold ${profitColor}`}>£{formatMoney(currentTotals?.profit)}</span>
             </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
            <tr>
              <th className="px-4 py-2">Timestamp</th>
              <th className="px-4 py-2">Modified By</th>
              <th className="px-4 py-2">Adjustment Type</th>
              <th className="px-4 py-2">Field</th>
              <th className="px-4 py-2 text-right">Old</th>
              <th className="px-4 py-2 text-right">New</th>
              <th className="px-4 py-2">Impact</th>
              <th className="px-4 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {amendments.map((item, idx) => (
              <tr key={item.id || idx} className={`transition-colors ${item.isReversed ? 'bg-gray-50 opacity-60' : 'hover:bg-blue-50'}`}>
                <td className="px-4 py-2.5 text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString('en-GB')} 
                  <span className="text-gray-400 text-[10px] block">
                    {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-700">
                    {item.user ? `${item.user.firstName} ${item.user.lastName}` : 'System'}
                </td>
                <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${item.type === 'WRITE_OFF' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.type}
                    </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-gray-600 uppercase text-[10px]">
                    {item.propertyName}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">£{parseFloat(item.oldValue).toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">£{parseFloat(item.newValue).toFixed(2)}</td>
                <td className="px-4 py-2.5">
                  {renderDiff(item.propertyName, item.difference, item.isReversed)}
                </td>
                <td className="px-4 py-2.5 text-gray-500 italic max-w-xs truncate" title={item.reason}>
                    {item.isReversed && <FaUndo className="inline mr-1 text-red-400" />}
                    {item.reason || 'No reason provided'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function BookingsPage() {
  const [allBookings, setAllBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [showVoided, setShowVoided] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'folderNo', direction: 'descending' });

  const toggleExpandRow = (bookingId) => {
    setExpandedRows(prev => ({
      ...prev,
      [bookingId]: !prev[bookingId],
    }));
  };

  const formatDateDisplay = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getBookings(); 
      const bookingsData = Array.isArray(response.data.data.data) ? response.data.data.data : [];
      setAllBookings(bookingsData);
    } catch (error) {
      setError(error.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleBookingUpdate = () => {
    setSelectedBooking(null);
    fetchBookings();
  };
  
  const groupedAndSortedBookings = useMemo(() => {
    const initialList = showVoided 
        ? allBookings 
        : allBookings.filter(b => b.bookingStatus !== 'VOID');

    if (!initialList.length) return [];

    const bookingMap = new Map();
    const rootBookings = [];

    initialList.forEach(booking => {
      bookingMap.set(booking.id, { ...booking, children: [] });
    });

    initialList.forEach(booking => {
      const bookingNode = bookingMap.get(booking.id);
      const parentId = bookingNode.originalBookingId;
      if (parentId && bookingMap.has(parentId)) {
        bookingMap.get(parentId).children.push(bookingNode);
      } else {
        rootBookings.push(bookingNode);
      }
    });
    
    rootBookings.forEach(root => {
        // Handle cancellation sub-item inject
        if (root.cancellation) {
            root.children.push({ 
                ...root.cancellation, 
                isCancellation: true,
                folderNo: root.folderNo, // Link folder for display
                paxName: root.paxName 
            });
        }
        root.children.sort((a, b) => compareFolderNumbers(a.folderNo, b.folderNo));
    });

    if (sortConfig.key) {
      rootBookings.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        let comparison = 0;
        
        if (sortConfig.key === 'folderNo') {
          comparison = compareFolderNumbers(valA, valB);
        } else if (['revenue', 'balance', 'profit'].includes(sortConfig.key)) {
          comparison = (parseFloat(valA) || 0) - (parseFloat(valB) || 0);
        } else if (sortConfig.key === 'travelDate') {
          comparison = (new Date(valA).getTime() || 0) - (new Date(valB).getTime() || 0);
        } else {
          comparison = String(valA || '').localeCompare(String(valB || ''));
        }
        return sortConfig.direction === 'descending' ? -comparison : comparison;
      });
    }
    return rootBookings;
  }, [allBookings, sortConfig, showVoided]);

  const filteredBookings = useMemo(() => {
    if (!searchTerm) return groupedAndSortedBookings;
    const searchLower = searchTerm.toLowerCase();
    return groupedAndSortedBookings.filter(booking => {
      const inParent = 
        booking.folderNo?.toString().toLowerCase().includes(searchLower) ||
        booking.refNo?.toLowerCase().includes(searchLower) ||
        booking.paxName?.toLowerCase().includes(searchLower) ||
        booking.agentName?.toLowerCase().includes(searchLower) ||
        booking.pnr?.toLowerCase().includes(searchLower);
      if (inParent) return true;
      return booking.children?.some(child => {
          if (child.isCancellation) return child.description?.toLowerCase().includes(searchLower);
          return child.folderNo?.toString().toLowerCase().includes(searchLower) ||
                 child.refNo?.toLowerCase().includes(searchLower) ||
                 child.pnr?.toLowerCase().includes(searchLower);
      });
    });
  }, [groupedAndSortedBookings, searchTerm]);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <FaSort className="inline ml-1 text-gray-400 opacity-50" />;
    return sortConfig.direction === 'ascending' ? <FaSortUp className="inline ml-1 text-white" /> : <FaSortDown className="inline ml-1 text-white" />;
  };

  const SortableHeader = ({ sortKey, title, className = '' }) => (
    <th 
      scope="col" 
      className={`px-4 py-3.5 text-left text-sm font-semibold text-white uppercase tracking-wider cursor-pointer select-none transition-colors hover:bg-slate-700 ${className}`}
      onClick={() => handleSort(sortKey)}
    >
      {title} {getSortIcon(sortKey)}
    </th>
  );
  
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'COMPLETED': return { backgroundColor: `${COLORS.successGreen}2A`, color: COLORS.successGreen };
      case 'CONFIRMED': return { backgroundColor: `${COLORS.accentYellow}2A`, color: '#D99B0A' };
      case 'CANCELLED': return { backgroundColor: `${COLORS.accentRed}2A`, color: COLORS.accentRed };
      case 'VOID': return { backgroundColor: '#E5E7EB', color: '#4B5563', border: '1px solid #9CA3AF' };
      default: return { backgroundColor: '#E5E7EB', color: '#4B5563' };
    }
  }

  const getRefundStatusBadgeStyle = (status) => {
    switch (status) {
      case 'PAID': return { backgroundColor: `${COLORS.successGreen}2A`, color: COLORS.successGreen };
      case 'PENDING': return { backgroundColor: `${COLORS.accentOrange}2A`, color: COLORS.accentOrange };
      default: return { backgroundColor: '#E5E7EB', color: '#4B5563' };
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: COLORS.lightGray }}>
      <FaSpinner className="animate-spin h-10 w-10 text-slate-600" />
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: COLORS.lightGray }}>
      <div className="max-w-full mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold" style={{ color: COLORS.primaryBlue }}>Live Bookings Ledger</h1>
          <p className="text-gray-500 mt-1">Real-time oversight of financial amendments and booking statuses.</p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="relative flex-grow max-w-lg">
            <FaSearch className="absolute inset-y-0 left-3 h-full w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by Folder, Ref, Pax, Agent..."
              className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-400 transition-all outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <input
                type="checkbox"
                id="showVoided"
                checked={showVoided}
                onChange={(e) => setShowVoided(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-slate-700"
            />
            <label htmlFor="showVoided" className="text-sm font-medium text-gray-600">Show Voided Records</label>
          </div>
        </div>
        
        {error && <div className="mb-4 p-3 rounded-lg flex items-center gap-2 bg-red-50 text-red-600 border border-red-200"><FaExclamationTriangle />{error}</div>}
        
        <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead style={{ backgroundColor: COLORS.primaryBlue }}>
                <tr>
                  <th scope="col" className="w-12 px-3 py-3.5"></th>
                  <SortableHeader sortKey="folderNo" title="Folder" />
                  <SortableHeader sortKey="refNo" title="Reference" />
                  <SortableHeader sortKey="paxName" title="Passenger" />
                  <SortableHeader sortKey="agentName" title="Agent" />
                  <SortableHeader sortKey="pnr" title="PNR" />
                  <SortableHeader sortKey="fromTo" title="Route" />
                  <SortableHeader sortKey="bookingStatus" title="Status" />
                  <SortableHeader sortKey="travelDate" title="Travel" />
                  <SortableHeader sortKey="revenue" title="Revenue" className="text-right" />
                  <SortableHeader sortKey="balance" title="Balance" className="text-right" />
                  <SortableHeader sortKey="profit" title="Profit" className="text-right" />
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map((booking, index) => {
                    const isEven = index % 2 === 0;
                    const isExpanded = expandedRows[booking.id];

                    return (
                      <React.Fragment key={booking.id}>
                        <tr 
                            className={`border-b border-gray-100 transition-all cursor-pointer hover:bg-slate-50 ${booking.bookingStatus === 'VOID' ? 'opacity-50 grayscale bg-gray-50' : ''}`}
                            style={{ backgroundColor: isEven ? '#FFFFFF' : '#FBFCFD' }}
                            onClick={() => setSelectedBooking(booking)}
                          >
                          <td onClick={(e) => e.stopPropagation()} className="px-3 py-4 text-center">
                            <button onClick={() => toggleExpandRow(booking.id)} className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 transition-colors">
                                {isExpanded ? <FaChevronDown className="h-3 w-3" /> : <FaChevronRight className="h-3 w-3" />}
                            </button>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-slate-700">{booking.folderNo}</td>
                          <td className="px-4 py-4 text-xs font-mono text-gray-500">{booking.refNo}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-800">{booking.paxName}</td>
                          <td className="px-4 py-4 text-xs text-gray-500 uppercase font-medium">{booking.agentName}</td>
                          <td className="px-4 py-4 text-xs font-mono text-slate-600">{booking.pnr}</td>
                          <td className="px-4 py-4 text-xs text-gray-600">{booking.fromTo}</td>
                          <td className="px-4 py-4">
                            <span className="px-2 py-1 font-bold text-[10px] rounded uppercase tracking-tighter" style={getStatusBadgeStyle(booking.bookingStatus)}>
                              {booking.bookingStatus}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-gray-500">{formatDateDisplay(booking.travelDate)}</td>
                          <td className="px-4 py-4 text-right text-sm font-medium text-emerald-600">£{parseFloat(booking.revenue || 0).toFixed(2)}</td>
                          <td className={`px-4 py-4 text-right text-sm font-medium ${parseFloat(booking.balance) > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>£{parseFloat(booking.balance || 0).toFixed(2)}</td>
                          <td className={`px-4 py-4 text-right text-sm font-bold ${parseFloat(booking.profit) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>£{parseFloat(booking.profit || 0).toFixed(2)}</td>
                        </tr>

                        {isExpanded && (
                            <React.Fragment>
                                {booking.children.map(child => (
                                    child.isCancellation ? (
                                        <tr key={`${booking.id}-cancel`} className="text-xs border-b-2" style={{ backgroundColor: `${COLORS.accentRed}1A`, borderColor: `${COLORS.accentRed}3A` }}>
                                            <td className="px-3 py-3"></td>
                                            <td className="px-4 py-3 whitespace-nowrap font-bold text-sm" style={{ color: COLORS.accentRed, paddingLeft: '2.5rem' }}>↳ {child.folderNo}</td>
                                            <td className="px-4 py-3" colSpan="5">
                                                <div className="flex gap-4 items-center">
                                                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded">
                                                        <FaExclamationTriangle /> Cancellation
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <FaFileInvoiceDollar className="text-red-500"/> Fee: <span className="font-bold">£{child.supplierCancellationFee?.toFixed(2) || '0.00'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <FaHandHoldingUsd className="text-blue-500"/> Admin: <span className="font-bold">£{child.adminFee?.toFixed(2) || '0.00'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <FaReceipt className="text-purple-500"/> Credit: <span className="font-bold">£{(child.creditNoteAmount || 0).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="px-2 py-1 font-bold text-[9px] rounded-full" style={getRefundStatusBadgeStyle(child.refundStatus)}>
                                                    {child.refundStatus} REFUND
                                                </span>
                                            </td>
                                            <td colSpan="4"></td>
                                        </tr>
                                    ) : (
                                        <tr key={child.id} className="text-xs bg-slate-50 border-b border-slate-100 hover:bg-slate-100 cursor-pointer" onClick={() => setSelectedBooking(child)}>
                                            <td></td>
                                            <td className="px-4 py-3 font-bold text-slate-500 pl-8">↳ {child.folderNo}</td>
                                            <td className="px-4 py-3 font-mono text-gray-400">{child.refNo}</td>
                                            <td className="px-4 py-3 text-gray-600">{child.paxName}</td>
                                            <td colSpan="4"></td>
                                            <td className="px-4 py-3">{formatDateDisplay(child.travelDate)}</td>
                                            <td className="px-4 py-3 text-right">£{parseFloat(child.revenue || 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right">£{parseFloat(child.balance || 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold">£{parseFloat(child.profit || 0).toFixed(2)}</td>
                                        </tr>
                                    )
                                ))}
                                <tr>
                                    <td colSpan="12" className="p-0 bg-white">
                                        <AmendmentHistory 
                                            amendments={booking.amendments} 
                                            currentTotals={{
                                                revenue: booking.revenue,
                                                balance: booking.balance,
                                                profit: booking.profit
                                            }}
                                        />
                                    </td>
                                </tr>
                            </React.Fragment>
                        )}
                      </React.Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="12" className="px-6 py-24 text-center">
                      <FaFolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-200" />
                      <h3 className="text-lg font-medium text-gray-400">No data found</h3>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {selectedBooking && (
        <BookingDetailsPopup 
            booking={selectedBooking} 
            onClose={() => setSelectedBooking(null)}
            onSave={handleBookingUpdate}
        />
      )}
    </div>
  );
}