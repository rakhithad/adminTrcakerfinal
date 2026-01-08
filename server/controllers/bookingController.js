const { PrismaClient } = require('@prisma/client');
const apiResponse = require('../utils/apiResponse');
const { generateNextInvoiceNumber } = require('../utils/invoiceService');
const { createInvoicePdf } = require('../utils/pdfService');
const { createAuditLog, ActionType } = require('../utils/auditLogger');

const prisma = new PrismaClient();

//HELPERS

const syncInitialCommission = async (tx, bookingId) => {
    const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { 
            commissionEntries: { where: { type: 'INITIAL' } } 
        }
    });

    if (!booking || booking.bookingStatus === 'VOID') return;

    const profit = parseFloat(booking.profit || 0);
    const targetAmount = booking.paymentMethod.includes('FULL') ? profit : (profit / 2);

    if (booking.commissionEntries.length > 0) {
        const hasFinal = await tx.commissionLedger.findFirst({
            where: { bookingId, type: 'FINAL_RECONCILIATION' }
        });

        if (!hasFinal) {
            await tx.commissionLedger.update({
                where: { id: booking.commissionEntries[0].id },
                data: { amount: targetAmount }
            });
        }
    } else {
        // FIX: Ensure you are using the agent's ID, not their Name.
        // If your Booking model doesn't have agentId, we must find the user by name.
        const agent = await tx.user.findFirst({
            where: { 
                OR: [
                    { id: booking.agentId }, // Use ID if available
                    { firstName: booking.agentName.split(' ')[0] } // Fallback to name search
                ]
            }
        });

        if (!agent) throw new Error(`Agent not found for name: ${booking.agentName}`);

        await tx.commissionLedger.create({
            data: {
                bookingId: booking.id,
                agentId: agent.id, // This must be the User.id (e.g., "29eb6411...")
                type: 'INITIAL',
                amount: targetAmount,
                commissionMonth: booking.pcDate
            }
        });
    }
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
const compareAndLogChanges = async (tx, { modelName, recordId, userId, oldRecord, newRecord, updates }) => {
  const changes = [];
  // Get a list of all fields that were part of the update request
  const fieldsToCheck = Object.keys(updates);

  for (const key of fieldsToCheck) {
    // We don't log complex array/object updates in detail for now.
    // This can be expanded later if needed.
    if (Array.isArray(updates[key]) || typeof updates[key] === 'object' && updates[key] !== null) {
      changes.push({
        fieldName: key,
        oldValue: '(Previous Collection)',
        newValue: '(Updated Collection)',
      });
      continue;
    }

    // Only log if the value has actually changed.
    // We convert to string for a reliable, type-agnostic comparison.
    if (String(oldRecord[key]) !== String(newRecord[key])) {
      changes.push({
        fieldName: key,
        oldValue: oldRecord[key],
        newValue: newRecord[key],
      });
    }
  }

  if (changes.length > 0) {
    await createAuditLog(tx, {
      userId,
      modelName,
      recordId,
      action: ActionType.UPDATE,
      changes,
    });
  }
};


// CONTROLLERS

const createPendingBooking = async (req, res) => {
  console.log('Received body for pending booking:', JSON.stringify(req.body, null, 2));
  const { id: userId } = req.user;

  try {
    // We separate initialPayments from the req.body
    const { initialPayments = [], prodCostBreakdown = [], ...bookingData } = req.body;

    const pendingBooking = await prisma.$transaction(async (tx) => {
      // --- Validation ---
      const requiredFields = [ 'ref_no', 'pax_name', 'agent_name', 'team_name', 'pnr', 'airline', 'from_to', 'bookingType', 'paymentMethod', 'pcDate', 'travelDate', 'numPax' ];
      const missingFields = requiredFields.filter((field) => !bookingData[field] && bookingData[field] !== 0);
      if (missingFields.length > 0) throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      if (initialPayments.length === 0) throw new Error('At least one initial payment must be provided.');
      // --- End Validation ---
      
      const calculatedProdCost = prodCostBreakdown.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
      const calculatedReceived = initialPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
      const revenue = bookingData.revenue ? parseFloat(bookingData.revenue) : 0;
      const transFee = bookingData.transFee ? parseFloat(bookingData.transFee) : 0;
      const surcharge = bookingData.surcharge ? parseFloat(bookingData.surcharge) : 0;
      const profit = revenue - calculatedProdCost - transFee - surcharge;
      const balance = revenue - calculatedReceived;

      // Step 1: Create the PendingBooking *without* initialPayments
      const newPendingBooking = await tx.pendingBooking.create({
        data: {
          createdById: userId,
          refNo: bookingData.ref_no,
          paxName: bookingData.pax_name,
          agentName: bookingData.agent_name,
          teamName: bookingData.team_name,
          pnr: bookingData.pnr,
          airline: bookingData.airline,
          fromTo: bookingData.from_to,
          bookingType: bookingData.bookingType,
          bookingStatus: 'PENDING',
          pcDate: new Date(bookingData.pcDate),
          issuedDate: bookingData.issuedDate ? new Date(bookingData.issuedDate) : null,
          paymentMethod: bookingData.paymentMethod,
          lastPaymentDate: bookingData.lastPaymentDate ? new Date(bookingData.lastPaymentDate) : null,
          travelDate: bookingData.travelDate ? new Date(bookingData.travelDate) : null,
          revenue: revenue || null,
          prodCost: calculatedProdCost || null,
          transFee: transFee || null,
          surcharge: surcharge || null,
          balance: balance,
          profit: profit,
          invoiced: bookingData.invoiced || null,
          description: bookingData.description || null,
          status: 'PENDING',
          numPax: parseInt(bookingData.numPax),
          costItems: {
            create: (prodCostBreakdown || []).map((item) => ({
              category: item.category,
              amount: parseFloat(item.amount),
            })),
          },
          instalments: { create: (bookingData.instalments || []).map(inst => ({ dueDate: new Date(inst.dueDate), amount: parseFloat(inst.amount), status: inst.status || 'PENDING' })) },
          passengers: { create: (bookingData.passengers || []).map(pax => ({ ...pax, birthday: pax.birthday ? new Date(pax.birthday) : null })) },
        },
      });

      // Step 2: Manually loop and create InitialPayments
      for (const payment of initialPayments) {
        const newInitialPayment = await tx.initialPayment.create({
          data: {
            amount: parseFloat(payment.amount),
            transactionMethod: payment.transactionMethod,
            paymentDate: new Date(payment.receivedDate),
            pendingBookingId: newPendingBooking.id // Link to the pending booking
          }
        });

        // Step 3: If it's a credit note, process it
        if (payment.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && payment.creditNoteDetails) {
          for (const usedNote of payment.creditNoteDetails) {
            const creditNote = await tx.customerCreditNote.findUnique({
              where: { id: usedNote.id }
            });

            // Validation
            if (!creditNote) throw new Error(`Customer Credit Note ${usedNote.id} not found.`);
            // --- REMOVED NAME CHECK ---
            // if (creditNote.customerName !== newPendingBooking.paxName) throw new Error(`Credit Note ${usedNote.id} does not belong to ${newPendingBooking.paxName}.`);
            if (creditNote.remainingAmount < usedNote.amountToUse) throw new Error(`Insufficient funds on Credit Note ${usedNote.id}.`);

            // Update the credit note
            const newRemaining = creditNote.remainingAmount - usedNote.amountToUse;
            await tx.customerCreditNote.update({
              where: { id: usedNote.id },
              data: {
                remainingAmount: newRemaining,
                status: newRemaining < 0.01 ? 'USED' : 'PARTIALLY_USED'
              }
            });

            // Create the usage record
            await tx.customerCreditNoteUsage.create({
              data: {
                amountUsed: usedNote.amountToUse,
                creditNoteId: usedNote.id,
                usedOnInitialPaymentId: newInitialPayment.id // Link to the InitialPayment
              }
            });
          }
        }
      }

      await createAuditLog(tx, {
        userId: userId,
        modelName: 'PendingBooking',
        recordId: newPendingBooking.id,
        action: ActionType.CREATE_PENDING,
      });

      // Step 4: Return the full booking with all relations
      return tx.pendingBooking.findUnique({
        where: { id: newPendingBooking.id },
        include: { 
          costItems: { include: { suppliers: true } }, 
          instalments: true, 
          passengers: true,
          initialPayments: { // Include the linked credit note usage
            include: {
              appliedCustomerCreditNoteUsage: true
            }
          }
        }
      });
    }, {
        timeout: 10000 // Increase transaction timeout to 10 seconds
    }); // End of prisma.$transaction

    return apiResponse.success(res, pendingBooking, 201);
  } catch (error) {
    console.error('Pending booking creation error:', error);
    if (error instanceof Error && (error.message.includes('Missing required fields') || error.message.includes('Invalid') || error.message.includes('must') || error.message.includes('Credit Note') || error.message.includes('Insufficient funds'))) {
      return apiResponse.error(res, error.message, 400);
    }
    if (error.code === 'P2002') return apiResponse.error(res, 'A booking with a similar unique identifier already exists.', 409);
    return apiResponse.error(res, `Failed to create pending booking: ${error.message}`, 500);
  }
};


const getPendingBookings = async (req, res) => {
  try {
    const pendingBookings = await prisma.pendingBooking.findMany({
      where: { status: 'PENDING' },
      include: {
        costItems: { include: { suppliers: true } },
        instalments: true,
        passengers: true,
        initialPayments: true, // <-- Added initialPayments for completeness, if frontend uses it
      },
      orderBy: { // Good practice to have a default order for list views
        createdAt: 'desc',
      },
    });
    return apiResponse.success(res, pendingBookings);
  } catch (error) {
    console.error("Error fetching pending bookings:", error);
    return apiResponse.error(res, "Failed to fetch pending bookings: " + error.message, 500);
  }
};

const approveBooking = async (req, res) => {
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) {
    return apiResponse.error(res, 'Invalid booking ID', 400);
  }

  const { id: approverId } = req.user;

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const pendingBooking = await tx.pendingBooking.findUnique({
        where: { id: bookingId },
        include: {
          costItems: { include: { suppliers: true } },
          instalments: true,
          passengers: true,
          createdBy: true,
          initialPayments: { include: { appliedCustomerCreditNoteUsage: true } },
        },
      });

      if (!pendingBooking) throw new Error('Pending booking not found');
      if (pendingBooking.status !== 'PENDING') throw new Error('Pending booking already processed');

      const allBookings = await tx.booking.findMany({ select: { folderNo: true } });
      const maxFolderNo = Math.max(0, ...allBookings.map(b => parseInt(b.folderNo.split('.')[0], 10)).filter(n => !isNaN(n)));
      const newFolderNo = String(maxFolderNo + 1);

      const newBooking = await tx.booking.create({
        data: {
          folderNo: newFolderNo,
          refNo: pendingBooking.refNo,
          paxName: pendingBooking.paxName,
          agentName: pendingBooking.agentName,
          teamName: pendingBooking.teamName || null,
          pnr: pendingBooking.pnr,
          airline: pendingBooking.airline,
          fromTo: pendingBooking.fromTo,
          bookingType: pendingBooking.bookingType,
          bookingStatus: 'CONFIRMED',
          pcDate: pendingBooking.pcDate,
          accountingMonth: new Date(pendingBooking.createdAt.getFullYear(), pendingBooking.createdAt.getMonth(), 1),
          issuedDate: pendingBooking.issuedDate || null,
          paymentMethod: pendingBooking.paymentMethod,
          lastPaymentDate: pendingBooking.initialPayments.length > 0
            ? new Date(Math.max(...pendingBooking.initialPayments.map(p => new Date(p.paymentDate).getTime())))
            : null,
          travelDate: pendingBooking.travelDate || null,
          revenue: pendingBooking.revenue ? parseFloat(pendingBooking.revenue) : null,
          prodCost: pendingBooking.prodCost ? parseFloat(pendingBooking.prodCost) : null,
          transFee: pendingBooking.transFee ? parseFloat(pendingBooking.transFee) : null,
          surcharge: pendingBooking.surcharge ? parseFloat(pendingBooking.surcharge) : null,
          balance: pendingBooking.balance ? parseFloat(pendingBooking.balance) : null,
          profit: pendingBooking.profit ? parseFloat(pendingBooking.profit) : null,
          invoiced: pendingBooking.invoiced || null,
          description: pendingBooking.description || null,
          numPax: pendingBooking.numPax,
          costItems: {
            create: pendingBooking.costItems.map((item) => ({
              category: item.category,
              amount: parseFloat(item.amount),
            })),
          },
          instalments: {
            create: pendingBooking.instalments.map((inst) => ({
              dueDate: new Date(inst.dueDate),
              amount: parseFloat(inst.amount),
              status: inst.status || 'PENDING',
            })),
          },
          passengers: {
            create: pendingBooking.passengers.map((pax) => ({
              title: pax.title, firstName: pax.firstName, middleName: pax.middleName || null, lastName: pax.lastName,
              gender: pax.gender, email: pax.email || null, contactNo: pax.contactNo || null,
              nationality: pax.nationality || null, birthday: pax.birthday ? new Date(pax.birthday) : null, category: pax.category,
            })),
          },
        },
        include: { costItems: true }
      });

      for (const pendingPayment of pendingBooking.initialPayments) {
        const newInitialPayment = await tx.initialPayment.create({
          data: {
            amount: pendingPayment.amount,
            transactionMethod: pendingPayment.transactionMethod,
            paymentDate: pendingPayment.paymentDate,
            bookingId: newBooking.id
          }
        });

        if (pendingPayment.appliedCustomerCreditNoteUsage) {
          await tx.customerCreditNoteUsage.update({
            where: { id: pendingPayment.appliedCustomerCreditNoteUsage.id },
            data: { usedOnInitialPaymentId: newInitialPayment.id }
          });
        }
      }

      for (const [index, pendingItem] of pendingBooking.costItems.entries()) {
        const newCostItemId = newBooking.costItems[index].id;
        const pendingSuppliers = await tx.costItemSupplier.findMany({ where: { pendingCostItemId: pendingItem.id } });
        for (const supplier of pendingSuppliers) {
          await tx.costItemSupplier.update({
            where: { id: supplier.id },
            data: { costItemId: newCostItemId, pendingCostItemId: null },
          });
        }
      }

      await syncInitialCommission(tx, newBooking.id);

      await createAuditLog(tx, { userId: approverId, modelName: 'PendingBooking', recordId: pendingBooking.id, action: ActionType.APPROVE_PENDING });
      await tx.pendingBooking.update({ where: { id: bookingId }, data: { status: 'APPROVED' } });

      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          costItems: { include: { suppliers: true } },
          instalments: true,
          passengers: true,
          initialPayments: { include: { appliedCustomerCreditNoteUsage: true } }
        }
      });
    });

    return apiResponse.success(res, booking, 200);
  } catch (error) {
    return apiResponse.error(res, `Failed to approve booking: ${error.message}`, 500);
  }
};


const rejectBooking = async (req, res) => {
  // Get the ID of the user performing the rejection.
  const { id: userId } = req.user;
  const { id } = req.params; // This is the PendingBooking ID

  try {
    const updatedBooking = await prisma.$transaction(async (tx) => {
      const pendingBooking = await tx.pendingBooking.findUnique({
        where: { id: parseInt(id) },
      });

      if (!pendingBooking) {
        throw new Error("Pending booking not found");
      }
      if (pendingBooking.status !== 'PENDING') {
        throw new Error(`Pending booking already processed with status: ${pendingBooking.status}`);
      }
      
      // Audit Log for status change
      await createAuditLog(tx, {
        userId: userId,
        modelName: 'PendingBooking',
        recordId: pendingBooking.id,
        action: ActionType.REJECT_PENDING,
        changes: [{
          fieldName: 'status',
          oldValue: 'PENDING',
          newValue: 'REJECTED'
        }]
      });

      // Update the status to 'REJECTED'
      const rejectedBooking = await tx.pendingBooking.update({
        where: { id: parseInt(id) },
        data: {
          status: 'REJECTED'
        },
      });

      return rejectedBooking;
    }, {
        timeout: 10000 // Increase transaction timeout to 10 seconds
    }); // End of prisma.$transaction

    return apiResponse.success(res, { message: "Booking rejected successfully", data: updatedBooking }, 200);

  } catch (error) {
    console.error("Error rejecting booking:", error);
    if (error.message.includes('not found')) { // Catches 'Pending booking not found'
      return apiResponse.error(res, error.message, 404);
    }
    if (error.message.includes('already processed')) {
      return apiResponse.error(res, error.message, 409);
    }
    return apiResponse.error(res, `Failed to reject booking: ${error.message}`, 500);
  }
};

const createBooking = async (req, res) => {
  const { id: userId } = req.user;

  try {
    const { initialPayments = [], prodCostBreakdown = [], ...bookingData } = req.body;

    const requiredFields = [ 'ref_no', 'pax_name', 'agent_name', 'team_name', 'pnr', 'airline', 'from_to', 'bookingType', 'paymentMethod', 'pcDate', 'travelDate', 'numPax' ];
    const missingFields = requiredFields.filter(field => !bookingData[field] && bookingData[field] !== 0);
    if (missingFields.length > 0) {
      return apiResponse.error(res, `Missing required fields: ${missingFields.join(', ')}`, 400);
    }
    if (initialPayments.length === 0) {
      return apiResponse.error(res, "At least one initial payment must be provided.", 400);
    }

    const booking = await prisma.$transaction(async (tx) => {
      const calculatedProdCost = prodCostBreakdown.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
      const calculatedReceived = initialPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const revenue = bookingData.revenue ? parseFloat(bookingData.revenue) : 0;
      const transFee = bookingData.transFee ? parseFloat(bookingData.transFee) : 0;
      const surcharge = bookingData.surcharge ? parseFloat(bookingData.surcharge) : 0;

      const profit = revenue - calculatedProdCost - transFee - surcharge;
      const balance = revenue - calculatedReceived;
      const pcDate = new Date(bookingData.pcDate);

      const allBookings = await tx.booking.findMany({ select: { folderNo: true } });
      const maxFolderNo = Math.max(
        0,
        ...allBookings.map(b => parseInt(b.folderNo.split('.')[0], 10)).filter(n => !isNaN(n))
      );
      const newFolderNo = String(maxFolderNo + 1);

      const newBooking = await tx.booking.create({
        data: {
          folderNo: newFolderNo,
          refNo: bookingData.ref_no,
          paxName: bookingData.pax_name,
          agentName: bookingData.agent_name,
          teamName: bookingData.team_name,
          pnr: bookingData.pnr,
          airline: bookingData.airline,
          fromTo: bookingData.from_to,
          bookingType: bookingData.bookingType,
          bookingStatus: bookingData.bookingStatus || 'CONFIRMED',
          pcDate: pcDate,
          issuedDate: bookingData.issuedDate ? new Date(bookingData.issuedDate) : null,
          paymentMethod: bookingData.paymentMethod,
          lastPaymentDate: initialPayments.length > 0
            ? new Date(Math.max(...initialPayments.map(p => new Date(p.receivedDate).getTime())))
            : null,
          travelDate: new Date(bookingData.travelDate),
          description: bookingData.description || null,
          revenue,
          prodCost: calculatedProdCost,
          transFee,
          surcharge,
          profit,
          balance,
          invoiced: bookingData.invoiced || null,
          accountingMonth: new Date(pcDate.getFullYear(), pcDate.getMonth(), 1),
          numPax: parseInt(bookingData.numPax),
          costItems: {
            create: prodCostBreakdown.map(item => ({
              category: item.category, amount: parseFloat(item.amount),
              suppliers: { create: (item.suppliers || []).map(s => ({ ...s, amount: parseFloat(s.amount) })) },
            })),
          },
          instalments: {
            create: (bookingData.instalments || []).map(inst => ({
              ...inst, dueDate: new Date(inst.dueDate), amount: parseFloat(inst.amount), status: inst.status || 'PENDING'
            })),
          },
          passengers: {
            create: (bookingData.passengers || []).map(pax => ({
              ...pax, birthday: pax.birthday ? new Date(pax.birthday) : null,
            })),
          },
        },
      });

      for (const payment of initialPayments) {
        const newInitialPayment = await tx.initialPayment.create({
          data: {
            amount: parseFloat(payment.amount),
            transactionMethod: payment.transactionMethod,
            paymentDate: new Date(payment.receivedDate),
            bookingId: newBooking.id
          }
        });

        if (payment.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && payment.creditNoteDetails) {
          for (const usedNote of payment.creditNoteDetails) {
            const creditNote = await tx.customerCreditNote.findUnique({ where: { id: usedNote.id } });
            if (!creditNote) throw new Error(`Customer Credit Note ${usedNote.id} not found.`);
            const newRemaining = creditNote.remainingAmount - usedNote.amountToUse;
            await tx.customerCreditNote.update({
              where: { id: usedNote.id },
              data: {
                remainingAmount: newRemaining,
                status: newRemaining < 0.01 ? 'USED' : 'PARTIALLY_USED'
              }
            });
            await tx.customerCreditNoteUsage.create({
              data: {
                amountUsed: usedNote.amountToUse,
                creditNoteId: usedNote.id,
                usedOnInitialPaymentId: newInitialPayment.id
              }
            });
          }
        }
      }

      await syncInitialCommission(tx, newBooking.id);

      await createAuditLog(tx, {
        userId: userId,
        modelName: 'Booking',
        recordId: newBooking.id,
        action: ActionType.CREATE,
      });

      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          costItems: { include: { suppliers: true } },
          instalments: true,
          passengers: true,
          initialPayments: { include: { appliedCustomerCreditNoteUsage: true } }
        },
      });
    });

    return apiResponse.success(res, booking, 201);
  } catch (error) {
    console.error("Booking creation error:", error);
    return apiResponse.error(res, "Failed to create booking: " + error.message, 500);
  }
};

const getBookings = async (req, res) => {
  try {
    // 1. Get user details from the auth middleware
    const { role, firstName, lastName } = req.user;
    const agentName = `${firstName} ${lastName}`;

    // 2. Define permissions based on role
    const isAdmin = (role === 'ADMIN' || role === 'SUPER_ADMIN');
    const permissions = {
      canEdit: isAdmin,
      canCancel: isAdmin,
      canVoid: isAdmin,
      canDateChange: isAdmin
    };

    // 3. Create a filter based on the user's role
    const roleWhere = isAdmin ? {} : { agentName }; // Admins see all, others see their own

    // 4. Apply the filter to the Prisma query
    const bookings = await prisma.booking.findMany({
      where: roleWhere, // <-- FILTER IS APPLIED HERE
      include: {
        costItems: { include: { suppliers: true } },
        passengers: true,
        instalments: { include: { payments: true } },
        cancellation: {
          include: {
            createdCustomerPayable: { include: { settlements: true } },
            refundPayment: true,
            generatedCustomerCreditNote: {
              include: {
                generatedFromCancellation: {
                  select: { originalBooking: { select: { refNo: true } } }
                },
                usageHistory: {
                  include: {
                    usedOnInitialPayment: {
                      select: { booking: { select: { refNo: true } } }
                    }
                  }
                }
              }
            }
          }
        },
        initialPayments: {
          include: {
            appliedCustomerCreditNoteUsage: {
              include: {
                creditNote: {
                  include: {
                    generatedFromCancellation: {
                      select: { originalBooking: { select: { refNo: true } } }
                    }
                  }
                }
              }
            }
          }
        },
      },
      orderBy: { pcDate: 'desc' },
    });

    // 5. Loop through bookings and attach the permissions object
    const bookingsWithPermissions = bookings.map(booking => ({
      ...booking,
      _permissions: permissions
    }));

    // 6. Return data in the format your frontend expects
    return apiResponse.success(res, { data: bookingsWithPermissions });

  } catch (error) {
    console.error("Error fetching bookings:", error);
    return apiResponse.error(res, "Failed to get all bookings: " + error.message, 500);
  }
};

const updateBooking = async (req, res) => {
  const { id: userId } = req.user;
  const bookingId = parseInt(req.params.id);
  const updates = req.body;

  // Destructure the complex nested array from the rest of the simple updates
  // Keep the original breakdown with selectedCreditNotes info separate
  const { prodCostBreakdown: originalProdCostBreakdown, ...simpleUpdates } = updates;

  try {
    const updatedBooking = await prisma.$transaction(async (tx) => {
      // Step 1: Get the state of the booking before we change it for audit logging.
      const oldBooking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!oldBooking) {
        throw new Error('Booking not found');
      }

      // Step 2: If a new cost breakdown was provided, prepare it for update.
      if (originalProdCostBreakdown && Array.isArray(originalProdCostBreakdown)) {
        
        // Delete all old cost items associated with this booking.
        await tx.costItem.deleteMany({
          where: { bookingId: bookingId },
        });

        // Prepare the 'create' structure for the booking update.
        simpleUpdates.costItems = {
          create: originalProdCostBreakdown.map((item) => ({
            category: item.category,
            amount: parseFloat(item.amount),
            suppliers: {
              create: (item.suppliers || []).map((s) => ({
                supplier: s.supplier,
                amount: parseFloat(s.amount),
                paymentMethod: s.paymentMethod,
                paidAmount: parseFloat(s.paidAmount) || 0,
                pendingAmount: parseFloat(s.pendingAmount) || 0,
                transactionMethod: s.transactionMethod,
                firstMethodAmount: s.firstMethodAmount ? parseFloat(s.firstMethodAmount) : null,
                secondMethodAmount: s.secondMethodAmount ? parseFloat(s.secondMethodAmount) : null,
                // We DON'T store selectedCreditNotes here directly
              })),
            },
          })),
        };
      }
      
      // Step 3: Update the booking with simple fields AND the new nested cost items structure.
      const newBooking = await tx.booking.update({
        where: { id: bookingId },
        data: simpleUpdates, // simpleUpdates now contains the costItems create structure if breakdown was provided
        include: { // Include everything needed for the response and for the credit note logic below
          costItems: { include: { suppliers: true } },
          instalments: { include: { payments: true } }, // Include payments for full data
          passengers: true,
          initialPayments: true
        }
      });

      // --- NEW: Step 3.5: Process Credit Note Usage ---
      // This MUST happen AFTER newBooking is created so we have the new supplier IDs
      if (originalProdCostBreakdown && Array.isArray(originalProdCostBreakdown)) {
        // We need to iterate through the breakdown from the request *and* the result from the DB
        // to link the used notes to the newly created supplier records.
        // We assume the order is preserved. A more robust solution might match by category/supplier name if needed.
        for (const [itemIndex, originalItem] of originalProdCostBreakdown.entries()) {
          if (!originalItem.suppliers || !newBooking.costItems[itemIndex]) continue; // Safety check

          for (const [supplierIndex, originalSupplier] of originalItem.suppliers.entries()) {
             // Check if this supplier used credit notes
            if (originalSupplier.paymentMethod.includes('CREDIT_NOTES') && originalSupplier.selectedCreditNotes?.length > 0) {
              
              // Find the corresponding newly created CostItemSupplier
              const createdCostItemSupplier = newBooking.costItems[itemIndex]?.suppliers[supplierIndex];
              if (!createdCostItemSupplier) {
                 console.error(`Mismatch finding new supplier for item ${itemIndex}, supplier ${supplierIndex}`);
                 continue; // Skip if something went wrong finding the match
              }

              // Loop through the notes the user selected for this supplier
              for (const usedNote of originalSupplier.selectedCreditNotes) {
                  const creditNoteToUpdate = await tx.supplierCreditNote.findUnique({ 
                      where: { id: usedNote.id } 
                  });

                  // --- Backend Validation (Important!) ---
                  if (!creditNoteToUpdate) {
                      throw new Error(`Credit Note with ID ${usedNote.id} not found during update.`);
                  }
                  if (creditNoteToUpdate.supplier !== createdCostItemSupplier.supplier) {
                      throw new Error(`Credit Note ID ${usedNote.id} supplier mismatch during update.`);
                  }
                  // Check if there's enough balance *now* (could have changed since frontend loaded)
                  if (creditNoteToUpdate.remainingAmount < usedNote.amountToUse) {
                      throw new Error(`Insufficient funds on Credit Note ID ${usedNote.id} during update. Available: £${creditNoteToUpdate.remainingAmount.toFixed(2)}`);
                  }
                  // --- End Validation ---

                  const newRemainingAmount = creditNoteToUpdate.remainingAmount - usedNote.amountToUse;

                  // Update the credit note itself
                  await tx.supplierCreditNote.update({
                      where: { id: usedNote.id },
                      data: {
                          remainingAmount: newRemainingAmount,
                          status: newRemainingAmount < 0.01 ? 'USED' : 'PARTIALLY_USED',
                      },
                  });

                  // Create the usage history record
                  await tx.creditNoteUsage.create({
                      data: {
                          amountUsed: usedNote.amountToUse,
                          creditNoteId: usedNote.id,
                          usedOnCostItemSupplierId: createdCostItemSupplier.id, // Link to the NEW supplier ID
                      }
                  });
              } // end loop through selected notes
            } // end if supplier uses credit notes
          } // end loop through original suppliers
        } // end loop through original items
      } // end if breakdown exists
      // --- End NEW Credit Note Logic ---

      // Step 4: Log all the changes that were made.
      await compareAndLogChanges(tx, {
          modelName: 'Booking',
          recordId: bookingId,
          userId,
          oldRecord: oldBooking,
          newRecord: newBooking, // Use the final state after updates
          updates: updates, // Log based on the original request payload
      });

      return newBooking; // Return the final state of the booking
    });

    return apiResponse.success(res, updatedBooking);
  } catch (error) {
    console.error("Error updating booking:", error);
    // Add specific error handling for credit note issues
    if (error.message.includes('Credit Note') || error.message.includes('Insufficient funds')) {
         return apiResponse.error(res, `Credit Note Error: ${error.message}`, 400);
    }
    if (error.message === 'Booking not found') {
      return apiResponse.error(res, error.message, 404);
    }
    if (error.message.includes('Invalid')) { // Catches various "Invalid X amount/type" errors
        return apiResponse.error(res, error.message, 400);
    }
    return apiResponse.error(res, `Failed to update booking: ${error.message}`, 500);
  }
};

const getDateFilter = (startDate, endDate) => {
  const dateFilter = {};
  if (startDate) {
    dateFilter.gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    dateFilter.lt = end;
  }
  return dateFilter;
};

// --- UPDATED CONTROLLER 1 ---
const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { role, firstName, lastName } = req.user; // <-- FIXED
    const agentName = `${firstName} ${lastName}`;

    // --- Role-Based Filter ---
    // If ADMIN or SUPER_ADMIN, roleWhere is empty (gets all)
    // Otherwise, it filters by the logged-in user's agentName.
    const roleWhere = (role === 'ADMIN' || role === 'SUPER_ADMIN') 
      ? {} 
      : { agentName };
    // --- End Role Filter ---

    const bookingWhere = { ...roleWhere };
    const pendingWhere = { ...roleWhere }; // Assumes PendingBooking also has agentName

    if (startDate || endDate) {
      const dateFilter = getDateFilter(startDate, endDate);
      bookingWhere.createdAt = dateFilter;
      pendingWhere.createdAt = dateFilter;
    }

    const [
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      financials,
    ] = await Promise.all([
      prisma.booking.count({ where: bookingWhere }),
      prisma.pendingBooking.count({ where: pendingWhere }),
      prisma.booking.count({ 
        where: { ...bookingWhere, bookingStatus: 'CONFIRMED' } 
      }),
      prisma.booking.count({ 
        where: { ...bookingWhere, bookingStatus: 'COMPLETED' } 
      }),
      prisma.booking.aggregate({
        _sum: {
          revenue: true,
          profit: true,
        },
        // We only sum financials for the role's bookings
        where: { ...bookingWhere, bookingStatus: { notIn: ['VOID'] } },
      }),
    ]);
    
    // Balance Due is also filtered by role
    const totalBalanceDue = await prisma.booking.aggregate({
      _sum: { balance: true },
      where: { 
        ...roleWhere, // <-- Filter added
        balance: { gt: 0 },
        bookingStatus: { notIn: ['VOID', 'CANCELLED'] }
      },
    });

    return apiResponse.success(res, {
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      totalRevenue: financials._sum.revenue || 0,
      totalProfit: financials._sum.profit || 0,
      totalBalanceDue: totalBalanceDue._sum.balance || 0,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return apiResponse.error(res, 'Failed to fetch dashboard stats: ' + error.message, 500);
  }
};

// --- UPDATED CONTROLLER 2 ---
const getAttentionBookings = async (req, res) => {
  try {
    // Get user role and name from the auth middleware
    const { role, fullName: agentName } = req.user;

    // --- Role-Based Filter ---
    const roleWhere = (role === 'ADMIN' || role === 'SUPER_ADMIN') 
      ? {} 
      : { agentName };
    // --- End Role Filter ---

    const bookings = await prisma.booking.findMany({
      where: {
        ...roleWhere, // <-- Filter added
        bookingStatus: { notIn: ['CANCELLED', 'VOID'] },
        OR: [
          { issuedDate: null },
          { costItems: { none: {} } }
        ],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        refNo: true,
        paxName: true,
        issuedDate: true,
        _count: {
          select: { costItems: true },
        },
      },
    });

    const attentionList = bookings.map(b => ({
      id: b.id,
      refNo: b.refNo,
      paxName: b.paxName,
      reason: b.issuedDate === null 
        ? 'Missing Issued Date' 
        : 'Missing Supplier Costs',
    }));

    return apiResponse.success(res, attentionList);
  } catch (error) {
    console.error('Error fetching attention bookings:', error);
    return apiResponse.error(res, 'Failed to fetch attention bookings: ' + error.message, 500);
  }
};

// --- UPDATED CONTROLLER 3 ---
const getOverdueBookings = async (req, res) => {
  try {
    // Get user role and name from the auth middleware
    const { role, fullName: agentName } = req.user;

    // --- Role-Based Filter ---
    const roleWhere = (role === 'ADMIN' || role === 'SUPER_ADMIN') 
      ? {} 
      : { agentName };
    // --- End Role Filter ---

    const bookings = await prisma.booking.findMany({
      where: {
        ...roleWhere, // <-- Filter added
        bookingStatus: { notIn: ['CANCELLED', 'VOID'] },
        balance: { gt: 0 },
        travelDate: { lt: new Date() },
      },
      take: 10,
      orderBy: { travelDate: 'asc' },
      select: {
        id: true,
        refNo: true,
        paxName: true,
        travelDate: true,
        balance: true,
      },
    });
    return apiResponse.success(res, bookings);
  } catch (error) {
    console.error('Error fetching overdue bookings:', error);
    return apiResponse.error(res, 'Failed to fetch overdue bookings: ' + error.message, 500);
  }
};

const getRecentBookings = async (req, res) => {
  try {
    const recentBookings = await prisma.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        refNo: true,
        paxName: true,
        bookingStatus: true,
        createdAt: true,
        passengers: {
          select: {
            title: true,
            firstName: true,
            lastName: true,
            category: true,
          },
        },
      },
    });
    const recentPendingBookings = await prisma.pendingBooking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        refNo: true,
        paxName: true,
        status: true,
        createdAt: true,
        passengers: {
          select: {
            title: true,
            firstName: true,
            lastName: true,
            category: true,
          },
        },
      },
    });

    return apiResponse.success(res, {
      bookings: recentBookings,
      pendingBookings: recentPendingBookings,
    });
  } catch (error) {
    console.error('Error fetching recent bookings:', error);
    return apiResponse.error(res, 'Failed to fetch recent bookings: ' + error.message, 500);
  }
};

const updateInstalment = async (req, res) => {
  const { id: userId } = req.user;
  const { id } = req.params; 
  const { amount, status, transactionMethod, paymentDate } = req.body; 

  try {
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return apiResponse.error(res, 'Payment amount must be a positive number.', 400);
    }
    if (status !== 'PAID') {
        return apiResponse.error(res, 'Invalid status for payment action. Expected "PAID".', 400);
    }
    if (!transactionMethod || !paymentDate) {
        return apiResponse.error(res, 'Transaction method and payment date are required.', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const instalmentToUpdate = await tx.instalment.findUnique({
        where: { id: parseInt(id) },
        include: { 
            booking: {
                include: {
                    initialPayments: true,
                    amendments: { where: { isReversed: false } },
                    commissionEntries: { where: { type: 'INITIAL' } },
                    customerPayables: { include: { settlements: true } }
                }
            },
            payments: true 
        },
      });

      if (!instalmentToUpdate) throw new Error('Instalment not found');
      if (instalmentToUpdate.status === 'PAID') throw new Error('This instalment has already been marked as PAID.');

      await tx.instalmentPayment.create({
          data: {
              instalmentId: parseInt(id),
              amount: paymentAmount,
              transactionMethod,
              paymentDate: new Date(paymentDate),
          },
      });

      const updatedInstalment = await tx.instalment.update({
        where: { id: parseInt(id) },
        data: { status: 'PAID' }, 
        include: { payments: true } 
      });

      const booking = instalmentToUpdate.booking;
      const sumOfInitialPayments = booking.initialPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const allBookingsInstalments = await tx.instalment.findMany({
          where: { bookingId: instalmentToUpdate.bookingId },
          include: { payments: true }
      });

      const totalPaidViaInstalments = allBookingsInstalments.reduce((instSum, inst) => 
          instSum + inst.payments.reduce((paySum, p) => paySum + parseFloat(p.amount || 0), 0), 0
      );
      
      const sumOfPayables = booking.customerPayables.reduce((s, cp) => 
          s + cp.settlements.reduce((ss, s) => ss + parseFloat(s.amount || 0), 0), 0
      );

      const totalAdjustments = booking.amendments.reduce((sum, a) => sum + parseFloat(a.difference || 0), 0);
      
      const newTotalReceived = sumOfInitialPayments + totalPaidViaInstalments + sumOfPayables;
      const finalRevenue = parseFloat(booking.revenue || 0);
      const newBalance = finalRevenue - newTotalReceived + totalAdjustments;
      
      const updatedBooking = await tx.booking.update({
          where: { id: instalmentToUpdate.bookingId },
          data: {
              balance: newBalance,
              lastPaymentDate: new Date(paymentDate),
              bookingStatus: Math.abs(newBalance) < 0.01 ? 'COMPLETED' : booking.bookingStatus
          }
      });

      if (Math.abs(newBalance) < 0.01) {
          const existingReconciliation = await tx.commissionLedger.findFirst({
              where: { bookingId: booking.id, type: 'FINAL_RECONCILIATION' }
          });

          if (!existingReconciliation) {
              const initialPaid = booking.commissionEntries[0]?.amount || 0;
              const finalProfit = (finalRevenue - parseFloat(booking.prodCost || 0)) + totalAdjustments;
              const reconciliationAmount = finalProfit - initialPaid;

              let finalAgentId = null;
              const agentUser = await tx.user.findFirst({
                  where: { 
                      OR: [
                          { firstName: { contains: booking.agentName.split(' ')[0], mode: 'insensitive' } },
                          { id: booking.agentId || undefined }
                      ]
                  }
              });
              finalAgentId = agentUser?.id;

              if (finalAgentId && Math.abs(reconciliationAmount) > 0.01) {
                  await tx.commissionLedger.create({
                    data: {
                      bookingId: booking.id,
                      agentId: finalAgentId,
                      type: 'FINAL_RECONCILIATION',
                      amount: reconciliationAmount,
                      commissionMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    }
                  });
              }
          }
      }

      await createAuditLog(tx, {
        userId,
        modelName: 'Instalment',
        recordId: instalmentToUpdate.id,
        action: 'UPDATE',
        changes: [
            { fieldName: 'status', oldValue: instalmentToUpdate.status, newValue: 'PAID' },
            { fieldName: 'payment_recorded', oldValue: `No payment recorded`, newValue: `£${paymentAmount.toFixed(2)} via ${transactionMethod}` }
        ]
      });

      return {
          updatedInstalment: updatedInstalment,
          bookingUpdate: {
              id: updatedBooking.id,
              balance: updatedBooking.balance,
              received: newTotalReceived.toFixed(2)
          }
      };
    }, { timeout: 15000 });

    return apiResponse.success(res, result);
  } catch (error) {
    console.error('Error updating instalment:', error);
    return apiResponse.error(res, `Failed to update instalment: ${error.message}`, 500);
  }
};

const getCustomerDeposits = async (req, res) => {
  try {
    const { role, firstName, lastName } = req.user;
    const agentName = `${firstName} ${lastName}`;

    const isAdmin = (role === 'ADMIN' || role === 'SUPER_ADMIN');
    const permissions = {
      canSettlePayments: isAdmin,
    };

    const roleWhere = isAdmin ? {} : { agentName };

    const bookings = await prisma.booking.findMany({
      where: {
        ...roleWhere,
        paymentMethod: {
          in: ['INTERNAL', 'INTERNAL_HUMM', 'FULL', 'HUMM', 'FULL_HUMM'],
        },
      },
      select: {
        id: true,
        folderNo: true,
        refNo: true,
        paxName: true,
        agentName: true,
        pcDate: true,
        travelDate: true,
        revenue: true,
        bookingStatus: true,
        paymentMethod: true,
        initialPayments: {
          select: {
            id: true,
            amount: true,
            transactionMethod: true,
            paymentDate: true,
            appliedCustomerCreditNoteUsage: {
              include: {
                creditNote: {
                  include: {
                    generatedFromCancellation: {
                      select: {
                        originalBooking: {
                          select: { refNo: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        instalments: {
          select: {
            id: true,
            dueDate: true,
            amount: true,
            status: true,
            createdAt: true,
            payments: {
              select: {
                id: true,
                amount: true,
                transactionMethod: true,
                paymentDate: true,
                createdAt: true, // Include createdAt for sorting if paymentDate is the same
              },
            },
          },
        },
        amendments: {
          where: { isReversed: false },
          select: {
            id: true,
            difference: true,
            type: true,
            reason: true,
            isReversed: true,
            createdAt: true
          }
        },
        cancellation: {
          select: {
            id: true,
            adminFee: true,
            supplierCancellationFee: true,
            refundToPassenger: true,
            profitOrLoss: true,
            refundPayment: {
              select: {
                amount: true,
                transactionMethod: true,
                refundDate: true,
                createdAt: true, // Include createdAt for sorting if refundDate is the same
              }
            },
            refundStatus: true,
            createdCustomerPayable: {
              include: {
                settlements: { // Include settlements directly here
                  select: {
                    id: true,
                    amount: true,
                    transactionMethod: true,
                    paymentDate: true,
                    createdAt: true, // Include createdAt for sorting if paymentDate is the same
                  }
                }
              }
            },
            generatedCustomerCreditNote: {
              select: {
                id: true,
                initialAmount: true,
                remainingAmount: true,
                status: true,
                createdAt: true,
                usageHistory: {
                  select: {
                    amountUsed: true,
                    usedOnInitialPayment: {
                      select: {
                        booking: {
                          select: { refNo: true }
                        }
                      }
                    }
                  }
                },
                generatedFromCancellation: {
                  select: {
                    originalBooking: {
                      select: { refNo: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        pcDate: 'desc'
      }
    });

    const formattedBookings = bookings.map((booking) => {
  const revenue = parseFloat(booking.revenue || 0);

  const sumOfInitialPayments = (booking.initialPayments || [])
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  const sumOfPaidInstalments = (booking.instalments || [])
    .reduce((sum, inst) => {
      const paymentTotal = (inst.payments || []).reduce((pSum, p) => pSum + parseFloat(p.amount || 0), 0);
      return sum + paymentTotal;
    }, 0);

  // NEW: Sum up all active write-offs/adjustments
  const totalAdjustments = (booking.amendments || [])
    .reduce((sum, am) => sum + parseFloat(am.difference || 0), 0);

  let totalReceived = sumOfInitialPayments + sumOfPaidInstalments;
  
  // FIX: Include totalAdjustments in the balance math
  let currentBalance = revenue - totalReceived + totalAdjustments;

      const paymentHistory = [];
       (booking.initialPayments || []).forEach(payment => {
          let methodDisplay = payment.transactionMethod;
          let details = 'Initial payment';

          if (payment.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && payment.appliedCustomerCreditNoteUsage) {
              methodDisplay = 'Customer Credit';
              const creditNote = payment.appliedCustomerCreditNoteUsage.creditNote;
              const originalRefNo = creditNote?.generatedFromCancellation?.originalBooking?.refNo?.trim();
              details = `Used Note ID: ${creditNote.id} (from ${originalRefNo || 'N/A'})`;
          }

          paymentHistory.push({
              id: `initial-${payment.id}`,
              type: 'Initial Payment',
              date: payment.paymentDate,
              amount: parseFloat(payment.amount || 0),
              method: methodDisplay,
              details: details
          });
       });
       (booking.instalments || []).forEach(instalment => {
          (instalment.payments || []).forEach(payment => {
              paymentHistory.push({
                  id: `instalment-${payment.id}`,
                  type: `Instalment Payment`,
                  date: payment.paymentDate,
                  amount: parseFloat(payment.amount || 0),
                  method: payment.transactionMethod,
                  details: `Instalment due: ${new Date(instalment.dueDate).toLocaleDateString('en-GB')}`
              });
          });
       });

      if (booking.bookingStatus === 'CANCELLED' && booking.cancellation) {
        const cancellation = booking.cancellation;
        const refundToPassenger = parseFloat(cancellation.refundToPassenger || 0);
        const customerPayable = cancellation.createdCustomerPayable;
        const customerCreditNote = cancellation.generatedCustomerCreditNote;

        if (cancellation.refundPayment) {
          totalReceived -= parseFloat(cancellation.refundPayment.amount || 0);
          paymentHistory.push({
            id: 'refund-paid',
            type: 'Passenger Refund Paid',
            date: cancellation.refundPayment.refundDate,
            amount: -parseFloat(cancellation.refundPayment.amount || 0),
            method: cancellation.refundPayment.transactionMethod,
            details: 'Cash/Bank refund processed'
          });
        }

        if (customerCreditNote) {
            const originalRefNo = customerCreditNote.generatedFromCancellation?.originalBooking?.refNo?.trim();
            paymentHistory.push({
                id: `ccn-issued-${customerCreditNote.id}`,
                type: 'Credit Note Issued',
                date: customerCreditNote.createdAt,
                amount: parseFloat(customerCreditNote.initialAmount || 0),
                method: 'CUSTOMER_CREDIT_NOTE',
                details: `Note ID: ${customerCreditNote.id} (from ${originalRefNo || 'N/A'})`
            });
        }

        if (customerPayable && customerPayable.pendingAmount > 0) {
            currentBalance = parseFloat(customerPayable.pendingAmount);
            (customerPayable.settlements || []).forEach(settlement => {
                 paymentHistory.push({
                     id: `cp-settle-${settlement.id}`,
                     type: 'Cancellation Debt Paid',
                     date: settlement.paymentDate,
                     amount: parseFloat(settlement.amount || 0),
                     method: settlement.transactionMethod,
                     details: `Settled payable ID: ${customerPayable.id}`
                 });
            });
        } else if (cancellation.refundStatus === 'PENDING') {
            currentBalance = -refundToPassenger;
        } else if (cancellation.refundStatus === 'CREDIT_ISSUED') {
             currentBalance = totalReceived - (parseFloat(cancellation.supplierCancellationFee || 0) + parseFloat(cancellation.adminFee || 0));
        }
         else {
            currentBalance = 0;
        }
      }

      paymentHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

      const calculatedInitialDeposit = (booking.initialPayments || [])
          .sort((a,b) => new Date(a.paymentDate) - new Date(b.paymentDate))
          .slice(0, 1)
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      
          (booking.amendments || []).forEach(am => {
                paymentHistory.push({
                    id: `amendment-${am.id}`,
                    type: am.type === 'WRITE_OFF' ? 'Write-off' : 'Adjustment',
                    date: am.createdAt,
                    amount: parseFloat(am.difference || 0),
                    method: 'ADMIN',
                    details: am.isReversed ? `(REVERSED) ${am.reason}` : am.reason,
                    isReversed: am.isReversed // Pass this flag to the UI
                });
            });


          return {
      ...booking, // This spreads the original booking, including the 'instalments' array
      revenue: revenue.toFixed(2),
      received: totalReceived.toFixed(2),
      balance: currentBalance.toFixed(2),
      initialDeposit: sumOfInitialPayments.toFixed(2), 
      paymentHistory: paymentHistory,
      _permissions: permissions 
    };
    });

    return apiResponse.success(res, formattedBookings);
  } catch (error) {
    console.error('Error fetching customer deposits:', error);
    return apiResponse.error(res, `Failed to fetch customer deposits: ${error.message}`, 500);
  }
};

const createSupplierPaymentSettlement = async (req, res) => {
  const { id: userId } = req.user;
  // Destructure selectedCreditNotes from the body
  const { costItemSupplierId, amount, transactionMethod, settlementDate, selectedCreditNotes } = req.body;

  try {
    const parsedAmount = parseFloat(amount);

    // 1. Initial Validation
    if (!costItemSupplierId || isNaN(parsedAmount) || parsedAmount <= 0 || !transactionMethod || !settlementDate) {
      return apiResponse.error(res, 'Missing or invalid required fields', 400);
    }

    // Validate Credit Note Payload
    if (transactionMethod === 'CREDIT_NOTES') {
        if (!selectedCreditNotes || !Array.isArray(selectedCreditNotes) || selectedCreditNotes.length === 0) {
            return apiResponse.error(res, 'Credit Notes method selected but no notes provided', 400);
        }
    }

    const validTransactionMethods = ['LOYDS', 'STRIPE', 'WISE', 'HUMM', 'CREDIT_NOTES', 'CREDIT', 'BANK_TRANSFER'];
    if (!validTransactionMethods.includes(transactionMethod)) {
      return apiResponse.error(res, `Invalid transactionMethod.`, 400);
    }

    const { newSettlement, updatedCostItemSupplier, updatedBooking } = await prisma.$transaction(async (tx) => {
      // 2. Fetch CostItemSupplier
      const costItemSupplier = await tx.costItemSupplier.findUnique({
        where: { id: parseInt(costItemSupplierId) },
        include: {
          costItem: {
            include: {
              booking: {
                include: {
                  initialPayments: true,
                  instalments: { include: { payments: true } },
                  customerPayables: { include: { settlements: true } },
                  costItems: { include: { suppliers: { include: { settlements: true } } } },
                }
              }
            }
          }
        }
      });

      if (!costItemSupplier) throw new Error('CostItemSupplier not found');
      if (!costItemSupplier.costItem?.booking) throw new Error('Parent booking not found');

      const currentBooking = costItemSupplier.costItem.booking;
      const pendingAmount = parseFloat(costItemSupplier.pendingAmount ?? 0) || 0;

      if (parsedAmount > pendingAmount + 0.01) {
        throw new Error(`Amount exceeds pending amount`);
      }

      // --- NEW LOGIC START: Process Credit Notes ---
      if (transactionMethod === 'CREDIT_NOTES') {
        // Iterate through each selected note sent from frontend
        for (const note of selectedCreditNotes) {
            // 1. Deduct balance from the Credit Note
            const updatedNote = await tx.supplierCreditNote.update({
                where: { id: note.id },
                data: {
                    remainingAmount: { decrement: note.amountToUse }
                }
            });

            // 2. Check if we need to update status (USED vs PARTIALLY_USED)
            // Use a small epsilon (0.01) for float comparison
            if (updatedNote.remainingAmount <= 0.01) {
                await tx.supplierCreditNote.update({
                    where: { id: note.id },
                    data: { 
                        status: 'USED',
                        remainingAmount: 0 // Clean up float dust
                    }
                });
            } else {
                await tx.supplierCreditNote.update({
                    where: { id: note.id },
                    data: { status: 'PARTIALLY_USED' }
                });
            }

            // 3. Create the Usage Record (Link Note to CostItemSupplier)
            await tx.creditNoteUsage.create({
                data: {
                    creditNoteId: note.id,
                    usedOnCostItemSupplierId: parseInt(costItemSupplierId),
                    amountUsed: note.amountToUse,
                    usedAt: new Date(settlementDate)
                }
            });
        }
      }
      // --- NEW LOGIC END ---

      // 3. Create Settlement Record (Keeps your financial history clean)
      const createdSettlement = await tx.supplierPaymentSettlement.create({
        data: {
          costItemSupplierId: parseInt(costItemSupplierId),
          amount: parsedAmount,
          transactionMethod,
          settlementDate: new Date(settlementDate),
        },
      });

      // 4. Update CostItemSupplier Stats
      const newPaidAmountForSupplier = (parseFloat(costItemSupplier.paidAmount ?? 0) || 0) + parsedAmount;
      const newPendingAmountForSupplier = pendingAmount - parsedAmount;

      const finalUpdatedSupplier = await tx.costItemSupplier.update({
        where: { id: parseInt(costItemSupplierId) },
        data: {
          paidAmount: newPaidAmountForSupplier,
          pendingAmount: newPendingAmountForSupplier,
        },
        include: { settlements: true },
      });

      // 5. Recalculate Booking Financials (Your existing logic)
      const sumOfInitialPayments = (currentBooking.initialPayments || []).reduce((sum, p) => sum + p.amount, 0);
      const sumOfInstalmentPayments = (currentBooking.instalments || []).reduce((sum, inst) =>
        sum + (inst.payments || []).reduce((pSum, p) => pSum + p.amount, 0), 0);
      const sumOfCustomerPayableSettlements = (currentBooking.customerPayables || []).reduce((sum, payable) =>
        sum + (payable.settlements || []).reduce((sSum, s) => sSum + s.amount, 0), 0);

      const totalReceivedFromCustomer = sumOfInitialPayments + sumOfInstalmentPayments + sumOfCustomerPayableSettlements;

      const totalPaidToSuppliers = (currentBooking.costItems || []).reduce((ciSum, costItem) =>
        ciSum + (costItem.suppliers || []).reduce((sSum, supplier) =>
          sSum + (supplier.settlements || []).reduce((setSum, settlement) => setSum + settlement.amount, 0), 0), 0);

      const newProfit = (currentBooking.revenue ?? 0) - totalPaidToSuppliers - (currentBooking.transFee ?? 0) - (currentBooking.surcharge ?? 0);
      const newBalance = (currentBooking.revenue ?? 0) - totalReceivedFromCustomer;

      // 6. Update Booking
      const updatedBookingRecord = await tx.booking.update({
        where: { id: currentBooking.id },
        data: {
          balance: newBalance,
          profit: newProfit,
          lastPaymentDate: new Date(settlementDate),
        }
      });

      // 7. Audit Logs
      await createAuditLog(tx, {
        userId,
        modelName: 'CostItemSupplier',
        recordId: costItemSupplier.id,
        action: ActionType.SETTLEMENT_PAYMENT,
        changes: [{
          fieldName: 'supplierPaid',
          oldValue: `Paid: ${(costItemSupplier.paidAmount ?? 0).toFixed(2)}`,
          newValue: `Paid: ${newPaidAmountForSupplier.toFixed(2)} (Settlement via ${transactionMethod})`
        }]
      });

      return { newSettlement: createdSettlement, updatedCostItemSupplier: finalUpdatedSupplier, updatedBooking: updatedBookingRecord };
    }, {
      timeout: 10000
    });

    return apiResponse.success(res, { newSettlement, updatedCostItemSupplier, updatedBooking }, 201);
  } catch (error) {
    console.error('Error creating supplier payment settlement:', error);
    // ... existing error handlers
    return apiResponse.error(res, `Failed: ${error.message}`, 500);
  }
};

const getSuppliersInfo = async (req, res) => {
    try {
        const supplierSummary = {};

        const ensureSupplier = (supplierName) => {
            if (!supplierSummary[supplierName]) {
                supplierSummary[supplierName] = {
                    totalAmount: 0,
                    totalPaid: 0,
                    totalPending: 0,
                    transactions: [],
                    payables: [],
                };
            }
        };

        const bookingsWithCostItems = await prisma.booking.findMany({
            select: {
                id: true,
                refNo: true,
                bookingStatus: true,
                folderNo: true,
                paxName: true,
                costItems: {
                    select: {
                        category: true,
                        suppliers: {
                            select: {
                                id: true,
                                supplier: true,
                                amount: true,
                                paidAmount: true,
                                pendingAmount: true,
                                createdAt: true,
                                paymentMethod: true,
                                firstMethodAmount: true,
                                secondMethodAmount: true,
                                settlements: true,
                                paidByCreditNoteUsage: {
                                    include: {
                                        creditNote: true
                                    }
                                }
                            },
                        },
                    },
                },
            },
        });

        bookingsWithCostItems.forEach((booking) => {
            booking.costItems.forEach((item) => {
                item.suppliers.forEach((s) => {
                    ensureSupplier(s.supplier);
                    supplierSummary[s.supplier].transactions.push({
                        type: "Booking",
                        data: {
                            ...s,
                            folderNo: booking.folderNo,
                            refNo: booking.refNo,
                            category: item.category,
                            paxName: booking.paxName,
                            bookingStatus: booking.bookingStatus,
                            pendingAmount: booking.bookingStatus === "CANCELLED" ? 0 : s.pendingAmount,
                        },
                    });
                });
            });
        });

        // Fetch all Credit Notes
        const allCreditNotes = await prisma.supplierCreditNote.findMany({
            include: {
                generatedFromCancellation: {
                    include: {
                        originalBooking: {
                            select: {
                                refNo: true
                            }
                        }
                    },
                },
                usageHistory: {
                    include: {
                        usedOnCostItemSupplier: {
                            include: {
                                costItem: {
                                    include: {
                                        booking: {
                                            select: {
                                                refNo: true
                                            }
                                        }
                                    }
                                }
                            },
                        },
                    },
                },
            },
        });

        allCreditNotes.forEach((note) => {
            if (note.supplier) {
                ensureSupplier(note.supplier);
                const modifiedUsageHistory = note.usageHistory.map(usage => ({
                    ...usage,
                    usedOnRefNo: usage.usedOnCostItemSupplier?.costItem?.booking?.refNo || "N/A",
                }));

                supplierSummary[note.supplier].transactions.push({
                    type: "CreditNote",
                    data: {
                        ...note,
                        usageHistory: modifiedUsageHistory,
                        generatedFromRefNo: note.generatedFromCancellation?.originalBooking?.refNo || "N/A",
                    },
                });
            }
        });

        // Fetch all Pending Payables
        const allPayables = await prisma.supplierPayable.findMany({
            where: { status: "PENDING" },
            include: {
                createdFromCancellation: {
                    select: {
                        originalBooking: {
                            select: { folderNo: true },
                        },
                    },
                },
                settlements: true,
            },
        });

        allPayables.forEach((payable) => {
            if (payable.supplier) {
                ensureSupplier(payable.supplier);
                supplierSummary[payable.supplier].payables.push({
                    ...payable,
                    originatingFolderNo: payable.createdFromCancellation?.originalBooking?.folderNo || "N/A",
                });
            }
        });

        // Calculate Totals
        for (const supplierName in supplierSummary) {
            const supplier = supplierSummary[supplierName];
            const bookingTotals = supplier.transactions
                .filter((t) => t.type === "Booking")
                .reduce(
                    (acc, tx) => {
                        acc.totalAmount += tx.data.amount || 0;
                        acc.totalPaid += tx.data.paidAmount || 0;
                        acc.totalPending += (tx.data.bookingStatus === "CANCELLED" ? 0 : tx.data.pendingAmount || 0);
                        return acc;
                    }, { totalAmount: 0, totalPaid: 0, totalPending: 0 }
                );

            const payablesPending = supplier.payables.reduce((sum, p) => sum + p.pendingAmount, 0);

            supplier.totalAmount = bookingTotals.totalAmount;
            supplier.totalPaid = bookingTotals.totalPaid;
            supplier.totalPending = bookingTotals.totalPending + payablesPending;

            // Sort transactions
            supplier.transactions.sort((a, b) => new Date(b.data.createdAt) - new Date(a.data.createdAt));
        }

        return apiResponse.success(res, supplierSummary);
    } catch (error) {
        console.error("Error fetching suppliers info:", error);
        return apiResponse.error(
            res,
            `Failed to fetch suppliers info: ${error.message}`,
            500
        );
    }
};

const updatePendingBooking = async (req, res) => {
  const { id: userId } = req.user;
  const bookingId = parseInt(req.params.id);

  if (isNaN(bookingId)) {
    return apiResponse.error(res, 'Invalid pending booking ID', 400);
  }

  const updates = req.body;

  try {
    // --- 1. Initial Validation (Robustified) ---
    // Basic fields
    if (updates.numPax !== undefined) {
      const parsedNumPax = parseInt(updates.numPax);
      if (isNaN(parsedNumPax) || parsedNumPax < 1) {
        return apiResponse.error(res, 'numPax must be a positive integer', 400);
      }
    }

    // Enum Validations
    const validTeams = ['PH', 'TOURS', 'MARKETING', 'QC', 'IT']; // Added from schema
    if (updates.teamName && !validTeams.includes(updates.teamName)) {
      return apiResponse.error(res, `Invalid teamName. Must be one of: ${validTeams.join(', ')}`, 400);
    }

    const validBookingTypes = ['FRESH', 'DATE_CHANGE', 'CANCELLATION'];
    if (updates.bookingType && !validBookingTypes.includes(updates.bookingType)) {
      return apiResponse.error(res, `Invalid bookingType. Must be one of: ${validBookingTypes.join(', ')}`, 400);
    }

    const validPaymentMethods = ['FULL', 'INTERNAL', 'REFUND', 'HUMM', 'FULL_HUMM', 'INTERNAL_HUMM'];
    if (updates.paymentMethod && !validPaymentMethods.includes(updates.paymentMethod)) {
      return apiResponse.error(res, `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(', ')}`, 400);
    }

    // Cost Items Validation if provided
    const validSuppliers = ['BTRES', 'LYCA', 'CEBU', 'BTRES_LYCA', 'BA', 'TRAINLINE', 'EASYJET', 'FLYDUBAI'];
    const validSupplierPaymentMethods = [
      'BANK_TRANSFER', 'CREDIT', 'CREDIT_NOTES',
      'BANK_TRANSFER_AND_CREDIT', 'BANK_TRANSFER_AND_CREDIT_NOTES', 'CREDIT_AND_CREDIT_NOTES',
    ];
    // This validation block is now handled within the transaction below, combined with credit note logic

    // Instalments Validation if provided
    if (updates.instalments) {
      if (!Array.isArray(updates.instalments)) {
        return apiResponse.error(res, 'instalments must be an array', 400);
      }
      for (const inst of updates.instalments) {
        if (!inst.dueDate || isNaN(new Date(inst.dueDate).getTime()) || isNaN(parseFloat(inst.amount)) || parseFloat(inst.amount) <= 0 || !['PENDING', 'PAID', 'OVERDUE'].includes(inst.status || 'PENDING')) {
          return apiResponse.error(res, 'Each instalment must have a valid dueDate, positive amount, and valid status', 400);
        }
      }
    }

    // Passengers Validation if provided
    if (updates.passengers) {
      if (!Array.isArray(updates.passengers) || updates.passengers.length === 0) {
        return apiResponse.error(res, 'passengers must be a non-empty array', 400);
      }
      const validTitles = ['MR', 'MRS', 'MS', 'MASTER'];
      const validGenders = ['MALE', 'FEMALE', 'OTHER'];
      const validCategories = ['ADULT', 'CHILD', 'INFANT'];
      for (const pax of updates.passengers) {
        if (!pax.title || !validTitles.includes(pax.title)) return apiResponse.error(res, `Invalid or missing title for a passenger.`, 400);
        if (!pax.firstName || !pax.lastName) return apiResponse.error(res, `Missing first or last name for a passenger.`, 400);
        if (!pax.gender || !validGenders.includes(pax.gender)) return apiResponse.error(res, `Invalid or missing gender for a passenger.`, 400);
        if (!pax.category || !validCategories.includes(pax.category)) return apiResponse.error(res, `Invalid or missing category for a passenger.`, 400);
        if (pax.birthday && isNaN(new Date(pax.birthday).getTime())) return apiResponse.error(res, `Invalid birthday for a passenger.`, 400);
        if (pax.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pax.email)) return apiResponse.error(res, `Invalid email for a passenger.`, 400);
        if (pax.contactNo && !/^\+?\d{10,15}$/.test(pax.contactNo)) return apiResponse.error(res, `Invalid contact number for a passenger.`, 400);
      }
      if (updates.numPax !== undefined && parseInt(updates.numPax) < updates.passengers.length) {
        return apiResponse.error(res, 'numPax cannot be less than the number of passengers provided', 400);
      }
    }


    const updatedPendingBooking = await prisma.$transaction(async (tx) => {
      // 2. Get the record's current state with all relations for audit and credit note handling
      const oldBooking = await tx.pendingBooking.findUnique({
        where: { id: bookingId },
        include: {
          initialPayments: true,
          costItems: {
            include: {
              suppliers: {
                include: {
                  paidByCreditNoteUsage: true // Crucial for credit note reversal
                }
              }
            }
          },
          instalments: true,
          passengers: true,
        }
      });

      if (!oldBooking) {
        throw new Error('Pending booking not found');
      }

      // Store old record for audit logging
      const oldRecordForAudit = { ...oldBooking };

      // --- 3. Handle Credit Note Reversal for old CostItemSuppliers if 'costItems' are updated ---
      if (Array.isArray(updates.costItems)) { // If costItems are being replaced
        for (const oldCostItem of oldBooking.costItems) {
          for (const oldSupplier of oldCostItem.suppliers) {
            for (const usage of oldSupplier.paidByCreditNoteUsage) {
              const creditNoteToRefund = await tx.supplierCreditNote.findUnique({ where: { id: usage.creditNoteId } });
              if (creditNoteToRefund) {
                const newRemainingAmount = creditNoteToRefund.remainingAmount + usage.amountUsed;
                await tx.supplierCreditNote.update({
                  where: { id: creditNoteToRefund.id },
                  data: {
                    remainingAmount: newRemainingAmount,
                    status: newRemainingAmount === creditNoteToRefund.initialAmount ? 'AVAILABLE' : 'PARTIALLY_USED',
                  },
                });
                // Delete the usage record as the old supplier is being replaced
                await tx.creditNoteUsage.delete({ where: { id: usage.id } });
              }
            }
          }
        }
      }

      // --- 4. Financial Recalculation (Comprehensive) ---
      const currentRevenue = oldBooking.revenue || 0;
      const currentProdCost = oldBooking.prodCost || 0;
      const currentTransFee = oldBooking.transFee || 0;
      const currentSurcharge = oldBooking.surcharge || 0;
      
      const newRevenue = updates.revenue !== undefined ? parseFloat(updates.revenue) : currentRevenue;
      if (isNaN(newRevenue)) throw new Error('Invalid revenue amount.');

      const newTransFee = updates.transFee !== undefined ? parseFloat(updates.transFee) : currentTransFee;
      if (isNaN(newTransFee)) throw new Error('Invalid transaction fee amount.');

      const newSurcharge = updates.surcharge !== undefined ? parseFloat(updates.surcharge) : currentSurcharge;
      if (isNaN(newSurcharge)) throw new Error('Invalid surcharge amount.');

      // Calculate new prodCost if costItems are updated, otherwise use existing
      let newProdCost = currentProdCost;
      if (Array.isArray(updates.costItems)) {
        newProdCost = updates.costItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        if (isNaN(newProdCost)) throw new Error('Invalid production cost amount from cost items.');
      } else if (updates.prodCost !== undefined) { // If prodCost is updated directly without costItems array
        newProdCost = parseFloat(updates.prodCost);
        if (isNaN(newProdCost)) throw new Error('Invalid production cost amount.');
      }

      // Calculate new received if initialPayments are updated, otherwise use existing
      let newCalculatedReceived = oldBooking.initialPayments.reduce((sum, p) => sum + p.amount, 0); // Start with existing
      let latestPaymentDate = oldBooking.lastPaymentDate;

      if (Array.isArray(updates.initialPayments)) {
          newCalculatedReceived = updates.initialPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          if (isNaN(newCalculatedReceived)) throw new Error('Invalid received amount from initial payments.');
          
          // Determine the latest payment date from the new initial payments
          const dates = updates.initialPayments.map(p => new Date(p.paymentDate || p.receivedDate));
          if (dates.length > 0) {
              latestPaymentDate = new Date(Math.max(...dates));
          } else {
              latestPaymentDate = null; // No initial payments, so no last payment date
          }
      }

      const newProfit = newRevenue - newProdCost - newTransFee - newSurcharge;
      const newBalance = newRevenue - newCalculatedReceived;

      // 5. Construct the data object for the update, applying changes only if provided
      const dataForUpdate = {};

      if (updates.refNo !== undefined) dataForUpdate.refNo = updates.refNo;
      if (updates.paxName !== undefined) dataForUpdate.paxName = updates.paxName;
      if (updates.agentName !== undefined) dataForUpdate.agentName = updates.agentName;
      if (updates.teamName !== undefined) dataForUpdate.teamName = updates.teamName;
      if (updates.pnr !== undefined) dataForUpdate.pnr = updates.pnr;
      if (updates.airline !== undefined) dataForUpdate.airline = updates.airline;
      if (updates.fromTo !== undefined) dataForUpdate.fromTo = updates.fromTo;
      if (updates.bookingType !== undefined) dataForUpdate.bookingType = updates.bookingType;
      if (updates.pcDate !== undefined) dataForUpdate.pcDate = new Date(updates.pcDate);
      if (updates.issuedDate !== undefined) dataForUpdate.issuedDate = updates.issuedDate ? new Date(updates.issuedDate) : null;
      if (updates.paymentMethod !== undefined) dataForUpdate.paymentMethod = updates.paymentMethod;
      if (updates.travelDate !== undefined) dataForUpdate.travelDate = new Date(updates.travelDate);
      if (updates.invoiced !== undefined) dataForUpdate.invoiced = updates.invoiced;
      if (updates.description !== undefined) dataForUpdate.description = updates.description;
      if (updates.numPax !== undefined) dataForUpdate.numPax = parseInt(updates.numPax);
      
      // Apply calculated financials
      dataForUpdate.revenue = newRevenue;
      dataForUpdate.prodCost = newProdCost;
      dataForUpdate.transFee = newTransFee;
      dataForUpdate.surcharge = newSurcharge;
      dataForUpdate.profit = newProfit;
      dataForUpdate.balance = newBalance;
      dataForUpdate.lastPaymentDate = latestPaymentDate;


      // 6. Handle Nested Relations (deleteMany then create)
      if (Array.isArray(updates.initialPayments)) {
        dataForUpdate.initialPayments = {
          deleteMany: {},
          create: updates.initialPayments.map(p => ({
            amount: parseFloat(p.amount),
            transactionMethod: p.transactionMethod,
            paymentDate: new Date(p.receivedDate || p.paymentDate),
          })),
        };
      }

      if (Array.isArray(updates.costItems)) {
        // Validate new credit note usages if present
        const creditNoteUsageMap = new Map();
        const allCreditNoteIds = new Set();
        for (const [itemIdx, item] of updates.costItems.entries()) {
            if (!item.category || isNaN(parseFloat(item.amount)) || parseFloat(item.amount) <= 0) {
                throw new Error('Each cost item must have a category and a positive amount');
            }
            if (!Array.isArray(item.suppliers) || item.suppliers.length === 0) {
                throw new Error('Each cost item must have at least one supplier allocation');
            }
            const supplierTotal = item.suppliers.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
            if (Math.abs(parseFloat(item.amount) - supplierTotal) > 0.01) {
                throw new Error('Supplier amounts must sum to the cost item amount');
            }

            for (const [supplierIdx, s] of item.suppliers.entries()) {
                if (!s.supplier || !validSuppliers.includes(s.supplier) || isNaN(parseFloat(s.amount)) || parseFloat(s.amount) <= 0 || !validSupplierPaymentMethods.includes(s.paymentMethod)) {
                    throw new Error(`Invalid supplier data for ${s.supplier}: must have valid supplier, positive amount, and valid paymentMethod`);
                }

                if (s.paymentMethod.includes('CREDIT_NOTES')) {
                    const amountToCoverByNotes = (s.paymentMethod === 'CREDIT_NOTES')
                    ? (parseFloat(s.firstMethodAmount) || 0)
                    : (parseFloat(s.secondMethodAmount) || 0);
                    
                    let totalAppliedFromNotes = 0;
                    (s.selectedCreditNotes || []).forEach(usedNote => {
                        const parsedAmountToUse = parseFloat(usedNote.amountToUse || 0);
                        if (isNaN(parsedAmountToUse) || parsedAmountToUse <= 0) {
                            throw new Error(`Invalid credit note usage amount for Credit Note ID ${usedNote.id}.`);
                        }
                        totalAppliedFromNotes += parsedAmountToUse;
                        allCreditNoteIds.add(usedNote.id);

                        if (!creditNoteUsageMap.has(usedNote.id)) {
                            creditNoteUsageMap.set(usedNote.id, []);
                        }
                        creditNoteUsageMap.get(usedNote.id).push({
                            amountToUse: parsedAmountToUse,
                            supplier: s.supplier,
                            itemIndex: itemIdx,
                            supplierIndex: supplierIdx
                        });
                    });
                    if (Math.abs(totalAppliedFromNotes - amountToCoverByNotes) > 0.01) {
                        throw new Error(`For supplier ${s.supplier}, the applied credit notes total (£${totalAppliedFromNotes.toFixed(2)}) does not match the required amount (£${amountToCoverByNotes.toFixed(2)}).`);
                    }
                }
            }
        }
        // Fetch all unique credit notes in one go for validation
        const existingCreditNotes = await tx.supplierCreditNote.findMany({
            where: { id: { in: Array.from(allCreditNoteIds) } },
        });
        const creditNoteLookup = new Map(existingCreditNotes.map(cn => [cn.id, cn]));

        // Final validation of new credit notes against fetched data
        for (const [cnId, usages] of creditNoteUsageMap.entries()) {
            const creditNote = creditNoteLookup.get(cnId);
            if (!creditNote) throw new Error(`Credit Note with ID ${cnId} not found.`);
            let totalUsedForThisCN = 0;
            for (const usage of usages) {
                if (creditNote.supplier !== usage.supplier) {
                    throw new Error(`Credit Note ID ${cnId} does not belong to supplier ${usage.supplier}.`);
                }
                totalUsedForThisCN += usage.amountToUse;
            }
            // Check remaining amount against the _current_ remaining amount (after any reversals)
            if (creditNote.remainingAmount < totalUsedForThisCN) {
                throw new Error(`Credit Note ID ${cnId} has insufficient funds. Remaining: £${creditNote.remainingAmount.toFixed(2)}, Attempted to use: £${totalUsedForThisCN.toFixed(2)}.`);
            }
        }

        dataForUpdate.costItems = {
          deleteMany: {},
          create: updates.costItems.map(item => ({
            category: item.category,
            amount: parseFloat(item.amount),
            suppliers: {
              create: (item.suppliers || []).map(s => ({
                supplier: s.supplier,
                amount: parseFloat(s.amount),
                paymentMethod: s.paymentMethod,
                paidAmount: parseFloat(s.paidAmount) || 0,
                pendingAmount: parseFloat(s.pendingAmount) || 0,
                transactionMethod: s.transactionMethod,
                firstMethodAmount: s.firstMethodAmount ? parseFloat(s.firstMethodAmount) : null,
                secondMethodAmount: s.secondMethodAmount ? parseFloat(s.secondMethodAmount) : null,
              })),
            },
          })),
        };
      }

      if (Array.isArray(updates.instalments)) {
        dataForUpdate.instalments = {
          deleteMany: {},
          create: updates.instalments.map(inst => ({
            dueDate: new Date(inst.dueDate),
            amount: parseFloat(inst.amount),
            status: inst.status || 'PENDING',
          })),
        };
      }

      if (Array.isArray(updates.passengers)) {
        dataForUpdate.passengers = {
          deleteMany: {},
          create: updates.passengers.map(pax => ({
            title: pax.title,
            firstName: pax.firstName,
            middleName: pax.middleName || null,
            lastName: pax.lastName,
            gender: pax.gender,
            email: pax.email || null,
            contactNo: pax.contactNo || null,
            nationality: pax.nationality || null,
            birthday: pax.birthday ? new Date(pax.birthday) : null,
            category: pax.category,
          })),
        };
      }

      // 7. Perform the update
      const finalPendingBooking = await tx.pendingBooking.update({
        where: { id: bookingId },
        data: dataForUpdate,
        include: {
          initialPayments: true,
          costItems: { include: { suppliers: true } },
          instalments: true,
          passengers: true,
        },
      });

      // 8. Apply Credit Note Usages for the newly created suppliers
      if (Array.isArray(updates.costItems)) {
          for (const [itemIndex, item] of updates.costItems.entries()) {
            const createdCostItem = finalPendingBooking.costItems.find(ci => ci.category === item.category && Math.abs(ci.amount - parseFloat(item.amount)) < 0.01);
            if (!createdCostItem) continue; // Should not happen if deleteMany/create worked
            
            for (const [supplierIndex, s] of (item.suppliers || []).entries()) {
              if (s.paymentMethod.includes('CREDIT_NOTES')) {
                const createdCostItemSupplier = createdCostItem.suppliers.find(sup => sup.supplier === s.supplier && Math.abs(sup.amount - parseFloat(s.amount)) < 0.01);
                if (!createdCostItemSupplier) continue;

                for (const usedNote of (s.selectedCreditNotes || [])) {
                  const amountToUse = parseFloat(usedNote.amountToUse);
                  await tx.supplierCreditNote.update({
                    where: { id: usedNote.id },
                    data: {
                      remainingAmount: { decrement: amountToUse },
                      status: {
                          // Determine new status based on remainingAmount after decrement
                          // This requires a separate fetch or logic here that ensures final amount
                          // For simplicity, we assume Prisma handles it correctly with decrement
                          // or would need to fetch after decrement for precise status update.
                          // A safer approach for status might be to re-evaluate it after all usages are applied.
                      },
                    },
                  });

                  // Re-fetch the credit note to set the accurate status
                  const updatedCreditNote = await tx.supplierCreditNote.findUnique({where: {id: usedNote.id}});
                  await tx.supplierCreditNote.update({
                      where: {id: usedNote.id},
                      data: {
                          status: updatedCreditNote.remainingAmount < 0.01 ? 'USED' : 'PARTIALLY_USED'
                      }
                  });


                  await tx.creditNoteUsage.create({
                    data: {
                      amountUsed: amountToUse,
                      creditNoteId: usedNote.id,
                      usedOnCostItemSupplierId: createdCostItemSupplier.id,
                    }
                  });
                }
              }
            }
          }
      }

      // 9. Audit Log changes
      await compareAndLogChanges(tx, {
        userId,
        modelName: 'PendingBooking',
        recordId: finalPendingBooking.id,
        oldRecord: oldRecordForAudit,
        newRecord: finalPendingBooking,
        updates: updates,
      });

      return finalPendingBooking;
    }, {
        timeout: 20000 // Increased transaction timeout to 20 seconds due to complex nested updates and credit note handling
    }); // End of prisma.$transaction

    return apiResponse.success(res, updatedPendingBooking, 200);

  } catch (error) {
    console.error('Error updating pending booking:', error);
    if (error.message.includes("not found")) return apiResponse.error(res, error.message, 404);
    if (error.message.includes('Invalid')) return apiResponse.error(res, error.message, 400);
    if (error.message.includes('missing')) return apiResponse.error(res, error.message, 400);
    if (error.message.includes('must')) return apiResponse.error(res, error.message, 400);
    if (error.message.includes('exceeds')) return apiResponse.error(res, error.message, 400);
    if (error.code === 'P2002') return apiResponse.error(res, 'Pending booking with this unique identifier already exists.', 409);
    return apiResponse.error(res, `Failed to update pending booking: ${error.message}`, 500);
  }
};

const recordSettlementPayment = async (req, res) => {
  const { id: userId } = req.user;
  const bookingId = parseInt(req.params.bookingId);
  const { amount, transactionMethod, paymentDate } = req.body;

  try {
    const paymentAmount = parseFloat(amount);
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          initialPayments: true,
          instalments: { include: { payments: true } },
          customerPayables: { include: { settlements: true } },
          amendments: { where: { isReversed: false } },
          commissionEntries: { where: { type: 'INITIAL' } },
          agent: true
        },
      });

      if (!booking) throw new Error('Booking not found');

      let settlementInstalment = booking.instalments.find(inst => inst.status === 'SETTLEMENT');
      if (!settlementInstalment) {
        settlementInstalment = await tx.instalment.create({
          data: {
            bookingId: booking.id,
            dueDate: new Date(paymentDate),
            amount: paymentAmount,
            status: 'SETTLEMENT',
          },
        });
      } else {
        await tx.instalment.update({
          where: { id: settlementInstalment.id },
          data: {
            amount: settlementInstalment.amount + paymentAmount,
            dueDate: new Date(paymentDate),
          }
        });
      }

      await tx.instalmentPayment.create({
        data: {
          instalmentId: settlementInstalment.id,
          amount: paymentAmount,
          transactionMethod,
          paymentDate: new Date(paymentDate),
        },
      });

      const totalInitial = booking.initialPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      
      const freshInstalments = await tx.instalment.findMany({
        where: { bookingId: booking.id },
        include: { payments: true }
      });
      
      const totalInstalments = freshInstalments.reduce((s, i) => 
        s + i.payments.reduce((ps, p) => ps + parseFloat(p.amount || 0), 0), 0);
        
      const totalPayables = booking.customerPayables.reduce((s, cp) => 
        s + cp.settlements.reduce((ss, s) => ss + parseFloat(s.amount || 0), 0), 0);
        
      const totalAdjustments = booking.amendments.reduce((s, a) => s + parseFloat(a.difference || 0), 0);
      
      const totalReceived = totalInitial + totalInstalments + totalPayables;
      const finalRevenue = parseFloat(booking.revenue || 0);
      const newBalance = finalRevenue - totalReceived + totalAdjustments;

      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          balance: newBalance,
          lastPaymentDate: new Date(paymentDate),
          bookingStatus: Math.abs(newBalance) < 0.01 ? 'COMPLETED' : booking.bookingStatus
        },
      });

      if (Math.abs(newBalance) < 0.01) {
        const existingReconciliation = await tx.commissionLedger.findFirst({
            where: { bookingId: booking.id, type: 'FINAL_RECONCILIATION' }
        });

        if (!existingReconciliation) {
            const initialPaid = booking.commissionEntries[0]?.amount || 0;
            const finalProfit = (finalRevenue - parseFloat(booking.prodCost || 0)) + totalAdjustments;
            const reconciliationAmount = finalProfit - initialPaid;

            let finalAgentId = booking.agentId;
            if (!finalAgentId) {
                const agentUser = await tx.user.findFirst({
                    where: { 
                        OR: [
                            { firstName: booking.agentName.split(' ')[0] },
                            { id: booking.createdBy?.id }
                        ]
                    }
                });
                finalAgentId = agentUser?.id;
            }

            if (finalAgentId && Math.abs(reconciliationAmount) > 0.01) {
                await tx.commissionLedger.create({
                  data: {
                    bookingId: booking.id,
                    agentId: finalAgentId,
                    type: 'FINAL_RECONCILIATION',
                    amount: reconciliationAmount,
                    commissionMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                  }
                });
            }
        }
      }

      return updatedBooking;
    });

    return apiResponse.success(res, result);
  } catch (error) {
    console.error("Settlement Error:", error);
    return apiResponse.error(res, error.message, 500);
  }
};

const getTransactions = async (req, res) => {
  try {
        const allInitialPayments = await prisma.initialPayment.findMany({
      where: {
        bookingId: { not: null } // Ensure it's from an approved booking
      },
      include: {
        booking: {
          select: { refNo: true, paxName: true }
        }
      }
    });

    // B) All Instalment Payments (this query remains the same and is correct)
    const instalmentPayments = await prisma.instalmentPayment.findMany({
      include: {
        instalment: {
          select: {
            booking: { select: { refNo: true, paxName: true } }
          }
        }
      },
    });

    // C) Credit Notes Received from a supplier (remains the same)
    const creditNotesReceived = await prisma.supplierCreditNote.findMany({
      select: { id: true, supplier: true, initialAmount: true, createdAt: true, generatedFromCancellation: { include: { originalBooking: { select: { refNo: true } } } } },
    });

    // D) Admin Fees from cancellations (remains the same)
    const adminFees = await prisma.cancellation.findMany({
      where: { adminFee: { gt: 0 } },
      include: { originalBooking: { select: { refNo: true } } }
    });


    // === MONEY OUT ===

    // E) Initial Supplier Payments (remains the same and is correct)
    const initialSupplierPayments = await prisma.costItemSupplier.findMany({
      where: {
        paymentMethod: 'BANK_TRANSFER',
        costItemId: { not: null }
      },
      include: {
        costItem: { include: { booking: { select: { refNo: true } } } },
      }
    });

    // F) Supplier Settlements (remains the same and is correct)
    const supplierSettlements = await prisma.supplierPaymentSettlement.findMany({
      where: {
        costItemSupplier: { costItemId: { not: null } }
      },
      include: { costItemSupplier: { select: { supplier: true, costItem: { select: { booking: { select: { refNo: true } } } } } } },
    });

    // G) Passenger Refunds (remains the same and is correct)
    const passengerRefunds = await prisma.passengerRefundPayment.findMany({
        include: {
            cancellation: {
                include: {
                    originalBooking: { select: { refNo: true, paxName: true } }
                }
            }
        }
    });


    // --- 2. MAP ALL EVENTS TO A STANDARDIZED FORMAT ---

    const transactionsList = [];

    // Map A) ALL Initial Payments
    allInitialPayments.forEach(payment => {
      transactionsList.push({
        id: `initialpay-${payment.id}`,
        type: 'Incoming',
        category: 'Initial Payment',
        date: payment.paymentDate,
        amount: payment.amount,
        bookingRefNo: payment.booking?.refNo || 'N/A',
        method: payment.transactionMethod,
        details: `From: ${payment.booking?.paxName || 'N/A'}`
      });
    });

    // Map B) All Instalment Payments
    instalmentPayments.forEach(payment => {
      transactionsList.push({
        id: `inst-${payment.id}`,
        type: 'Incoming',
        category: 'Instalment',
        date: payment.paymentDate,
        amount: payment.amount,
        bookingRefNo: payment.instalment.booking.refNo,
        method: payment.transactionMethod,
        details: `From: ${payment.instalment.booking.paxName}`
      });
    });

    // Map C) Credit Notes Received
    creditNotesReceived.forEach(note => {
      transactionsList.push({
        id: `cn-recv-${note.id}`,
        type: 'Incoming',
        category: 'Credit Note Received',
        date: note.createdAt,
        amount: note.initialAmount,
        bookingRefNo: note.generatedFromCancellation?.originalBooking?.refNo || 'N/A',
        method: 'Internal Credit',
        details: `From Supplier: ${note.supplier}`
      });
    });
    
    // Map D) Admin Fees
    adminFees.forEach(cancellation => {
      transactionsList.push({
        id: `adminfee-${cancellation.id}`,
        type: 'Incoming',
        category: 'Admin Fee',
        date: cancellation.createdAt,
        amount: cancellation.adminFee,
        bookingRefNo: cancellation.originalBooking.refNo,
        method: 'Internal',
        details: `Cancellation Admin Fee`
      });
    });

    // Map E) Initial Supplier Payments
    initialSupplierPayments.forEach(payment => {
      transactionsList.push({
        id: `supp-initial-${payment.id}`,
        type: 'Outgoing',
        category: 'Initial Supplier Pmt',
        date: payment.createdAt,
        amount: payment.amount,
        bookingRefNo: payment.costItem?.booking?.refNo || 'N/A',
        method: payment.transactionMethod,
        details: `To: ${payment.supplier}`
      });
    });
    
    // Map F) Supplier Settlements
    supplierSettlements.forEach(settlement => {
      transactionsList.push({
        id: `supp-settle-${settlement.id}`,
        type: 'Outgoing',
        category: 'Supplier Settlement',
        date: settlement.settlementDate,
        amount: settlement.amount,
        bookingRefNo: settlement.costItemSupplier?.costItem?.booking?.refNo || 'N/A',
        method: settlement.transactionMethod,
        details: `To: ${settlement.costItemSupplier?.supplier || 'Unknown'}`
      });
    });

    // Map G) Passenger Refunds
    passengerRefunds.forEach(refund => {
        const cancellation = refund.cancellation;
        transactionsList.push({
            id: `refund-${refund.id}`,
            type: 'Outgoing',
            category: 'Passenger Refund',
            date: refund.refundDate,
            amount: refund.amount,
            bookingRefNo: cancellation.originalBooking.refNo,
            method: refund.transactionMethod,
            details: `To: ${cancellation.originalBooking.paxName}`
        });
    });


    // --- 3. COMBINE, SORT, AND CALCULATE TOTALS ---
    const allTransactions = transactionsList.filter(t => t && t.id);
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalIncoming = allTransactions.filter(t => t.type === 'Incoming').reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalOutgoing = allTransactions.filter(t => t.type === 'Outgoing').reduce((sum, t) => sum + (t.amount || 0), 0);
    const netBalance = totalIncoming - totalOutgoing;

    const payload = {
      transactions: allTransactions,
      totals: { incoming: totalIncoming, outgoing: totalOutgoing, netBalance: netBalance },
    };
     
    return apiResponse.success(res, payload);

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return apiResponse.error(res, `Failed to fetch transactions: ${error.message}`, 500);
  }
};

const createCancellation = async (req, res) => {
  const { id: userId } = req.user;
  const { id: triggerBookingId } = req.params;
  const { supplierCancellationFee, adminFee } = req.body;

  if (supplierCancellationFee === undefined || adminFee === undefined) {
    return apiResponse.error(res, 'Supplier Fee and Admin Fee are required.', 400);
  }

  try {
    // 1. Validate and parse input amounts
    const parsedSupplierCancellationFee = parseFloat(supplierCancellationFee);
    const parsedAdminFee = parseFloat(adminFee);

    if (isNaN(parsedSupplierCancellationFee) || parsedSupplierCancellationFee < 0) {
      return apiResponse.error(res, 'Supplier Cancellation Fee must be a non-negative number.', 400);
    }
    if (isNaN(parsedAdminFee) || parsedAdminFee < 0) {
      return apiResponse.error(res, 'Admin Fee must be a non-negative number.', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const triggerBooking = await tx.booking.findUnique({
          where: { id: parseInt(triggerBookingId) },
          select: { id: true, folderNo: true, paxName: true, bookingStatus: true }
        });
      if (!triggerBooking) throw new Error('Booking not found.');
      if (triggerBooking.bookingStatus === 'CANCELLED') throw new Error('Booking already cancelled.');

      const baseFolderNo = triggerBooking.folderNo.toString().split('.')[0];
      const chainBookings = await tx.booking.findMany({
        where: { OR: [{ folderNo: baseFolderNo }, { folderNo: { startsWith: `${baseFolderNo}.` } }] },
        select: {
          id: true,
          folderNo: true,
          bookingStatus: true,
          revenue: true,
          prodCost: true,
          initialPayments: true,
          instalments: {
            include: { payments: true }
          },
          costItems: {
            include: { suppliers: true } // This is essential for the fix
          }
        },
      });

      if (chainBookings.some(b => b.bookingStatus === 'CANCELLED')) {
        throw new Error('This booking chain has already been cancelled.');
      }
      const rootBookingInChain = chainBookings.find(b => b.folderNo === baseFolderNo);
      if (!rootBookingInChain) throw new Error('Could not find root booking in chain.');

      // --- Calculations ---
      
      // We still need this for the Profit/Loss calculation
      const totalOwedToSupplierBeforeCancellation = chainBookings.reduce((sum, booking) => {
        // Sum prodCost for all *active* bookings in the chain
        if (booking.bookingStatus !== 'CANCELLED') {
            return sum + (booking.prodCost || 0);
        }
        return sum;
       }, 0);

      const totalChainReceivedFromCustomer = chainBookings.reduce((sum, booking) => {
        const initialSum = (booking.initialPayments || []).reduce((acc, p) => acc + p.amount, 0);
        const instalmentSum = (booking.instalments || []).reduce((acc, inst) => acc + (inst.payments || []).reduce((pAcc, p) => pAcc + p.amount, 0), 0);
        return sum + initialSum + instalmentSum;
      }, 0);

      const supCancellationFee = parseFloat(supplierCancellationFee);
      const customerTotalCancellationFee = supCancellationFee + parseFloat(adminFee);
      
      // --- *** THIS IS THE FIX *** ---
      
      // 1. Calculate what was actually paid to all suppliers in the chain
      const totalPaidToSupplier = chainBookings.reduce((sum, booking) => {
          const costItems = booking.costItems || [];
          const bookingPaidSum = costItems.reduce((ciSum, item) => {
              const suppliers = item.suppliers || [];
              const supplierPaidSum = suppliers.reduce((sSum, sup) => sSum + (sup.paidAmount || 0), 0);
              return ciSum + supplierPaidSum;
          }, 0);
          return sum + bookingPaidSum;
      }, 0);

      // 2. Calculate the new supplier balance.
      // This is (What we owe for the fee) - (What we've already paid)
      const supplierPayableOrCredit = supCancellationFee - totalPaidToSupplier;
      
      // 3. Determine the outcome
      let supplierCreditNoteAmount = 0;
      let supplierPayableAmount = 0;
      
      if (supplierPayableOrCredit > 0) {
          // We owe them more money
          // e.g. Fee is 200, Paid is 100. Payable = 100.
          supplierPayableAmount = supplierPayableOrCredit;
      } else if (supplierPayableOrCredit < 0) {
          // They owe us a credit
          // e.g. Fee is 200, Paid is 500. Credit = 300.
          supplierCreditNoteAmount = Math.abs(supplierPayableOrCredit);
      }
      // If 0, nothing happens.
      
      // --- *** END OF FIX *** ---

      // Customer calculations remain the same
      const customerDifference = totalChainReceivedFromCustomer - customerTotalCancellationFee;
      const refundToPassenger = customerDifference > 0 ? customerDifference : 0;
      const payableByCustomer = customerDifference < 0 ? Math.abs(customerDifference) : 0;

      // This P/L formula appears to calculate the final profit/loss of the *entire* chain, which is correct.
      const profitOrLoss = (totalChainReceivedFromCustomer - totalOwedToSupplierBeforeCancellation) - refundToPassenger + payableByCustomer;
      // --- End Calculations ---

      // --- Determine Refund Status ---
      let finalRefundStatus = 'N/A';
      if (refundToPassenger > 0) {
        finalRefundStatus = 'CREDIT_ISSUED';
      }
      // ---

      // 4. Create the Cancellation record
      const newCancellationRecord = await tx.cancellation.create({
        data: {
          originalBookingId: rootBookingInChain.id,
          folderNo: `${baseFolderNo}.C`, // Unique folder number for the cancellation record
          originalRevenue: rootBookingInChain.revenue || 0,
          originalProdCost: rootBookingInChain.prodCost || 0, // Keep original cost for records
          supplierCancellationFee: supCancellationFee,
          refundToPassenger: refundToPassenger,
          adminFee: parseFloat(adminFee),
          creditNoteAmount: supplierCreditNoteAmount, // Use the new fixed variable
          refundStatus: finalRefundStatus,
          profitOrLoss: profitOrLoss,
          description: `Cancellation for chain ${baseFolderNo}.`,
          accountingMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      });

      // --- *** MODIFIED BLOCK: Create Supplier Credit Note OR Payable *** ---
      const firstSupplier = chainBookings
            .flatMap(b => b.costItems || [])
            .flatMap(ci => ci.suppliers || [])
            .find(s => s?.supplier);

      if (supplierCreditNoteAmount > 0) {
        // We are owed a credit
        if (firstSupplier) {
          await tx.supplierCreditNote.create({
            data: {
              supplier: firstSupplier.supplier,
              initialAmount: supplierCreditNoteAmount, // Use new variable
              remainingAmount: supplierCreditNoteAmount, // Use new variable
              status: 'AVAILABLE',
              generatedFromCancellationId: newCancellationRecord.id,
            }
          });
        } else {
            console.warn(`Cancellation ${newCancellationRecord.id}: Could not find a supplier in chain ${baseFolderNo} to associate supplier credit note £${supplierCreditNoteAmount.toFixed(2)}. Credit note NOT created.`);
        }
      } else if (supplierPayableAmount > 0) {
        // We owe a new payable
        if (firstSupplier) {
          await tx.supplierPayable.create({
            data: {
              supplier: firstSupplier.supplier,
              totalAmount: supplierPayableAmount, // Use new variable
              pendingAmount: supplierPayableAmount, // Use new variable
              reason: `Cancellation fee shortfall for booking chain ${baseFolderNo}`,
              status: 'PENDING',
              createdFromCancellationId: newCancellationRecord.id,
            }
          });
        } else {
            console.warn(`Cancellation ${newCancellationRecord.id}: Could not find a supplier in chain ${baseFolderNo} to create supplier payable £${supplierPayableAmount.toFixed(2)}. Payable NOT created.`);
        }
      }
      // --- *** END MODIFIED BLOCK *** ---

      // --- Create Customer Payable ---
      if (payableByCustomer > 0) {
        await tx.customerPayable.create({
          data: {
            totalAmount: payableByCustomer,
            pendingAmount: payableByCustomer,
            reason: `Cancellation shortfall for booking chain ${baseFolderNo}`,
            status: 'PENDING',
            createdFromCancellationId: newCancellationRecord.id,
            bookingId: rootBookingInChain.id,
          },
        });
      }
      // --- End Customer Payable ---

      // --- Create Customer Credit Note ---
      if (refundToPassenger > 0) {
          await tx.customerCreditNote.create({
              data: {
                  customerName: triggerBooking.paxName,
                  initialAmount: refundToPassenger,
                  remainingAmount: refundToPassenger,
                  status: 'AVAILABLE',
                  generatedFromCancellationId: newCancellationRecord.id,
              }
          });
      }
      // --- End Customer Credit Note ---

      // Update booking statuses
      await tx.booking.updateMany({
          where: { id: { in: chainBookings.map(b => b.id) } },
          data: { bookingStatus: 'CANCELLED' }
      });

      // Audit log
      await createAuditLog(tx, {
        userId,
        modelName: 'Cancellation',
        recordId: newCancellationRecord.id,
        action: "CREATE_CANCELLATION",
        changes: [{ fieldName: 'status', oldValue: rootBookingInChain.bookingStatus, newValue: 'CANCELLED' }]
      });

       return tx.cancellation.findUnique({
          where: { id: newCancellationRecord.id },
          include: {
              generatedCreditNote: true,
              createdPayable: true,
              createdCustomerPayable: true,
              generatedCustomerCreditNote: true
          }
       });
    });

    return apiResponse.success(res, result, 201);
  } catch (error) {
    console.error("Error creating cancellation:", error);
    if (error.message.includes('already been cancelled') || error.message.includes('Booking not found') || error.message.includes('root booking')) {
      return apiResponse.error(res, error.message, 409);
    }
    if (error.message.includes('non-negative number')) {
        return apiResponse.error(res, error.message, 400);
    }
    return apiResponse.error(res, `Failed to create cancellation: ${error.message}`, 500);
  }
};

const getAvailableCreditNotes = async (req, res) => {
  try {
    const { supplier } = req.params;

    if (!supplier) {
      return apiResponse.error(res, 'Supplier name is required', 400);
    }
    
    const availableNotes = await prisma.supplierCreditNote.findMany({
      where: {
        supplier: supplier,
        status: { in: ['AVAILABLE', 'PARTIALLY_USED'] },
        remainingAmount: { gt: 0 }
      },
      // This include block is correct based on your schema
      include: {
        generatedFromCancellation: { // This matches your schema
          include: {
            originalBooking: {       // This assumes the relation on the Cancellation model is named 'originalBooking'
              select: {
                refNo: true          // This assumes the field on the Booking model is 'refNo'
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return apiResponse.success(res, availableNotes);

  } catch (error) {
    console.error('Error fetching available credit notes:', error);
    return apiResponse.error(res, `Failed to fetch credit notes: ${error.message}`, 500);
  }
};


const createDateChangeBooking = async (req, res) => {
  const { id: userId } = req.user;
  const originalBookingId = parseInt(req.params.id);
  // Separate payments from the rest of the data
  const { initialPayments = [], prodCostBreakdown = [], ...data } = req.body;

  try {
    // --- 1. Initial Input Validation (Pre-transaction) ---
    if (isNaN(originalBookingId)) {
      return apiResponse.error(res, 'Invalid original booking ID', 400);
    }

    // FIX: Update requiredFields to use snake_case to match frontend payload
    const requiredFields = [
      'ref_no', 'pax_name', 'agent_name', 'team_name', 'pnr', 'airline', 'from_to',
      'paymentMethod', 'pcDate', 'travelDate', 'revenue', 'numPax'
    ];
    
    const missingFields = requiredFields.filter(field => !data[field] && data[field] !== 0);
    if (missingFields.length > 0) {
      return apiResponse.error(res, `Missing required fields for new booking: ${missingFields.join(', ')}`, 400);
    }

    // Validate numeric fields for the new booking (using snake_case where appropriate)
    const parsedRevenue = parseFloat(data.revenue || 0);
    if (isNaN(parsedRevenue) || parsedRevenue < 0) return apiResponse.error(res, 'Revenue must be a non-negative number.', 400);
    const parsedProdCost = parseFloat(data.prodCost || 0);
    if (isNaN(parsedProdCost) || parsedProdCost < 0) return apiResponse.error(res, 'Production Cost must be a non-negative number.', 400);
    const parsedTransFee = parseFloat(data.transFee || 0); // Assuming transFee is camelCase from frontend
    if (isNaN(parsedTransFee) || parsedTransFee < 0) return apiResponse.error(res, 'Transaction Fee must be a non-negative number.', 400);
    const parsedSurcharge = parseFloat(data.surcharge || 0);
    if (isNaN(parsedSurcharge) || parsedSurcharge < 0) return apiResponse.error(res, 'Surcharge must be a non-negative number.', 400);
    const parsedNumPax = parseInt(data.numPax);
    if (isNaN(parsedNumPax) || parsedNumPax <= 0) return apiResponse.error(res, 'Number of passengers must be a positive integer.', 400);

    // Date validations
    if (isNaN(new Date(data.pcDate).getTime())) return apiResponse.error(res, 'Invalid PC Date.', 400);
    if (isNaN(new Date(data.travelDate).getTime())) return apiResponse.error(res, 'Invalid Travel Date.', 400);
    if (data.issuedDate && isNaN(new Date(data.issuedDate).getTime())) return apiResponse.error(res, 'Invalid Issued Date.', 400);
    if (data.lastPaymentDate && isNaN(new Date(data.lastPaymentDate).getTime())) return apiResponse.error(res, 'Invalid Last Payment Date.', 400);

    // Nested validations (similar to createBooking) - concise for brevity here
    if (data.initialPayments && !Array.isArray(data.initialPayments)) return apiResponse.error(res, 'initialPayments must be an array.', 400);
    if (data.prodCostBreakdown && !Array.isArray(data.prodCostBreakdown)) return apiResponse.error(res, 'prodCostBreakdown must be an array.', 400);
    if (data.instalments && !Array.isArray(data.instalments)) return apiResponse.error(res, 'instalments must be an array.', 400);
    if (data.passengers && !Array.isArray(data.passengers)) return apiResponse.error(res, 'passengers must be an array.', 400);


    const newBooking = await prisma.$transaction(async (tx) => {
      // --- Validation & Setup ---
      if (!data.travelDate || !data.revenue) throw new Error('Travel Date and Revenue are required for a date change.');
      const originalBooking = await tx.booking.findUnique({ where: { id: originalBookingId } });
      if (!originalBooking) throw new Error('Original booking not found.');
      
      const baseFolderNo = originalBooking.folderNo.toString().split('.')[0];
      const isChainCancelled = await tx.booking.findFirst({ where: { OR: [{ folderNo: baseFolderNo }, { folderNo: { startsWith: `${baseFolderNo}.` } }], bookingStatus: 'CANCELLED' } });
      if (isChainCancelled) throw new Error('This booking chain has been cancelled and cannot be modified further.');

      const relatedBookings = await tx.booking.findMany({ where: { folderNo: { startsWith: `${baseFolderNo}.` } } });
      const newIndex = relatedBookings.length;
      const newFolderNo = `${baseFolderNo}.${newIndex + 1}`;
      
      let bookingToUpdateId = originalBooking.id;
      let oldBookingStatus = originalBooking.bookingStatus;
      if (relatedBookings.length > 0) {
          const lastRelatedBooking = relatedBookings.sort((a, b) => (a.folderNo.includes('.') ? parseInt(a.folderNo.split('.')[1]) : 0) - (b.folderNo.includes('.') ? parseInt(b.folderNo.split('.')[1]) : 0)).pop();
          bookingToUpdateId = lastRelatedBooking.id;
          oldBookingStatus = lastRelatedBooking.bookingStatus;
      }
      await tx.booking.update({ where: { id: bookingToUpdateId }, data: { bookingStatus: 'COMPLETED' } });
      await createAuditLog(tx, { userId, modelName: 'Booking', recordId: bookingToUpdateId, action: ActionType.DATE_CHANGE, changes: [{ fieldName: 'bookingStatus', oldValue: oldBookingStatus, newValue: 'COMPLETED' }] });
      // --- End Validation & Setup ---

      // Step 1: Create the new Booking *without* initialPayments
      const newBookingRecord = await tx.booking.create({
        data: {
          originalBooking: { connect: { id: originalBooking.id } },
          folderNo: newFolderNo,
          bookingStatus: 'CONFIRMED', // New date change booking is confirmed
          bookingType: 'DATE_CHANGE',
          refNo: data.ref_no,          // FIX: Use snake_case
          paxName: data.pax_name,      // FIX: Use snake_case
          agentName: data.agent_name,  // FIX: Use snake_case
          teamName: data.team_name,    // FIX: Use snake_case
          pnr: data.pnr,
          airline: data.airline,
          fromTo: data.from_to,        // FIX: Use snake_case
          pcDate: new Date(data.pcDate),
          issuedDate: data.issuedDate ? new Date(data.issuedDate) : null,
          paymentMethod: data.paymentMethod,
          lastPaymentDate: latestPaymentDate,
          travelDate: new Date(data.travelDate),
          revenue: data.revenue,
          prodCost: data.prodCost,
          transFee: data.transFee,
          surcharge: data.surcharge,
          balance: data.balance,
          profit: data.profit,
          invoiced: data.invoiced,
          description: data.description,
          numPax: data.numPax,
          
          // --- THIS BLOCK IS NOW CORRECTED ---
          passengers: {
            create: (data.passengers || []).map(pax => ({
              // We explicitly list only the fields needed for creation
              title: pax.title,
              firstName: pax.firstName,
              middleName: pax.middleName,
              lastName: pax.lastName,
              gender: pax.gender,
              email: pax.email,
              contactNo: pax.contactNo,
              nationality: pax.nationality,
              birthday: pax.birthday ? new Date(pax.birthday) : null,
              category: pax.category
              // We DO NOT pass id, bookingId, createdAt, or updatedAt
            }))
          },
          // --- END OF CORRECTION ---

          instalments: { create: (data.instalments || []).map(inst => ({ dueDate: new Date(inst.dueDate), amount: parseFloat(inst.amount), status: inst.status || 'PENDING' })) },
          costItems: { create: (prodCostBreakdown || []).map(item => ({ category: item.category, amount: parseFloat(item.amount) })) }
        },
      });

      // Step 2: Manually loop and create InitialPayments
      for (const payment of initialPayments) {
        const newInitialPayment = await tx.initialPayment.create({
          data: {
            amount: parseFloat(payment.amount),
            transactionMethod: payment.transactionMethod,
            paymentDate: new Date(payment.receivedDate),
            bookingId: newBookingRecord.id // Link to the new main booking
          }
        });

        // Step 3: If it's a credit note, process it
        if (payment.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && payment.creditNoteDetails) {
          for (const usedNote of payment.creditNoteDetails) {
            const creditNote = await tx.customerCreditNote.findUnique({ where: { id: usedNote.id } });

            if (!creditNote) throw new Error(`Customer Credit Note ${usedNote.id} not found.`);
            if (creditNote.remainingAmount < usedNote.amountToUse) throw new Error(`Insufficient funds on Credit Note ${usedNote.id}.`);

            const newRemaining = creditNote.remainingAmount - usedNote.amountToUse;
            await tx.customerCreditNote.update({
              where: { id: usedNote.id },
              data: {
                remainingAmount: newRemaining,
                status: newRemaining < 0.01 ? 'USED' : 'PARTIALLY_USED'
              }
            });

            await tx.customerCreditNoteUsage.create({
              data: {
                amountUsed: usedNote.amountToUse,
                creditNoteId: usedNote.id,
                usedOnInitialPaymentId: newInitialPayment.id
              }
            });
          }
        }
      }

      await createAuditLog(tx, {
        userId,
        modelName: 'Booking',
        recordId: newBookingRecord.id,
        action: ActionType.CREATE, // Use CREATE or CREATE_DATE_CHANGE if you have that
        // Potentially add changes for the new booking's core fields
      });

      // Step 4: Return the full booking
      return tx.booking.findUnique({
        where: { id: newBookingRecord.id },
        include: { 
            costItems: { include: { suppliers: true } }, 
            instalments: true, 
            passengers: true, 
            initialPayments: { 
                include: {
                    appliedCustomerCreditNoteUsage: true
                }
            }
        }
      });
    }, {
        timeout: 15000 // Increased transaction timeout to 15 seconds
    }); // End of prisma.$transaction

    return apiResponse.success(res, newBooking, 201);
  } catch (error) {
    console.error('Error creating date change booking:', error);
    if (error.message.includes('booking chain has been cancelled')) return apiResponse.error(res, error.message, 409);
    if (error.message.includes('Credit Note') || error.message.includes('Insufficient funds')) return apiResponse.error(res, error.message, 400);
    return apiResponse.error(res, `Failed to create date change booking: ${error.message}`, 500);
  }
};

const createSupplierPayableSettlement = async (req, res) => {
    const { id: userId } = req.user;
    const { payableId, amount, transactionMethod, settlementDate } = req.body;

    try {
        const paymentAmount = parseFloat(amount);

        // 1. Validation
        if (!payableId) {
            return apiResponse.error(res, 'Missing payableId', 400);
        }
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return apiResponse.error(res, 'Amount must be a positive number', 400);
        }
        if (!transactionMethod || !settlementDate) {
            return apiResponse.error(res, 'Missing transactionMethod or settlementDate', 400);
        }
        if (isNaN(new Date(settlementDate).getTime())) {
            return apiResponse.error(res, 'Invalid settlement date', 400);
        }
        const validTransactionMethods = ['LOYDS', 'STRIPE', 'WISE', 'HUMM', 'CREDIT_NOTES', 'CREDIT', 'BANK_TRANSFER']; // Added BANK_TRANSFER from schema
        if (!validTransactionMethods.includes(transactionMethod)) {
          return apiResponse.error(res, `Invalid transactionMethod. Must be one of: ${validTransactionMethods.join(', ')}`, 400);
        }

        const result = await prisma.$transaction(async (tx) => {
            // 2. Fetch the SupplierPayable and its full chain to the Booking for comprehensive recalculation and logging
            const payable = await tx.supplierPayable.findUnique({
                where: { id: parseInt(payableId) },
                include: {
                    createdFromCancellation: {
                        include: {
                            originalBooking: {
                                include: {
                                    initialPayments: true,
                                    instalments: { include: { payments: true } },
                                    customerPayables: { include: { settlements: true } },
                                    costItems: { include: { suppliers: { include: { settlements: true } } } }, // Deep include for all supplier settlements
                                }
                            }
                        }
                    },
                    settlements: true // Include existing settlements for this payable
                }
            });

            if (!payable) {
                throw new Error('Supplier Payable record not found.');
            }
            if (!payable.createdFromCancellation?.originalBooking) {
                throw new Error('Could not find the original booking related to this payable.');
            }
            const currentBooking = payable.createdFromCancellation.originalBooking;

            const pendingAmount = parseFloat(payable.pendingAmount) || 0;
            if (paymentAmount > pendingAmount + 0.01) { // Add tolerance for floating-point issues
                throw new Error(`Settlement amount (£${paymentAmount.toFixed(2)}) exceeds pending amount (£${pendingAmount.toFixed(2)})`);
            }

            // 3. Create the new settlement history record
            const newPayableSettlement = await tx.supplierPayableSettlement.create({
                data: {
                    supplierPayableId: parseInt(payableId),
                    amount: paymentAmount,
                    transactionMethod: transactionMethod,
                    settlementDate: new Date(settlementDate),
                },
            });

            // 4. Update the parent SupplierPayable record's amounts and status
            const newPaidAmountForPayable = (parseFloat(payable.paidAmount) || 0) + paymentAmount;
            const newPendingAmountForPayable = pendingAmount - paymentAmount;
            
            const updatedPayableRecord = await tx.supplierPayable.update({
                where: { id: parseInt(payableId) },
                data: {
                    paidAmount: newPaidAmountForPayable,
                    pendingAmount: newPendingAmountForPayable,
                    status: newPendingAmountForPayable < 0.01 ? 'PAID' : 'PENDING',
                },
                include: { settlements: true } // Include settlements for return object
            });

            // 5. Recalculate Booking's comprehensive financial state
            // --- Sum of all payments received from customer ---
            const sumOfInitialPayments = (currentBooking.initialPayments || []).reduce((sum, p) => sum + p.amount, 0);
            const sumOfInstalmentPayments = (currentBooking.instalments || []).reduce((sum, inst) => 
                sum + (inst.payments || []).reduce((pSum, p) => pSum + p.amount, 0), 0);
            const sumOfCustomerPayableSettlements = (currentBooking.customerPayables || []).reduce((sum, customerPayable) => 
                sum + (customerPayable.settlements || []).reduce((sSum, s) => sSum + s.amount, 0), 0);
            
            const totalReceivedFromCustomer = sumOfInitialPayments + sumOfInstalmentPayments + sumOfCustomerPayableSettlements;

            // --- Sum of all payments made to ALL suppliers for ALL cost items and ALL supplier payables ---
            // Re-fetch supplier payables to include the latest settlement
            const allSupplierPayablesForBooking = await tx.supplierPayable.findMany({
                where: { createdFromCancellation: { originalBookingId: currentBooking.id } },
                include: { settlements: true }
            });

            const totalPaidViaSupplierPayables = (allSupplierPayablesForBooking || []).reduce((pSum, payable) => 
                pSum + (payable.settlements || []).reduce((sSum, s) => sSum + s.amount, 0), 0);

            const totalPaidViaCostItemSuppliers = (currentBooking.costItems || []).reduce((ciSum, costItem) => 
                ciSum + (costItem.suppliers || []).reduce((sSum, supplier) => 
                    sSum + (supplier.settlements || []).reduce((setSum, settlement) => setSum + settlement.amount, 0), 0), 0);
            
            const totalPaidToSuppliers = totalPaidViaCostItemSuppliers + totalPaidViaSupplierPayables;

            // Calculate derived fields (profit, balance) based on the latest figures
            const newProfit = (currentBooking.revenue || 0) - totalPaidToSuppliers - (currentBooking.transFee || 0) - (currentBooking.surcharge || 0);
            const newBalance = (currentBooking.revenue || 0) - totalReceivedFromCustomer;
            
            // Store old booking balance and profit for audit log
            const oldBookingBalance = currentBooking.balance;
            const oldBookingProfit = currentBooking.profit;

            // 6. Update the main Booking record with new financials
            const updatedBookingRecord = await tx.booking.update({
                where: { id: currentBooking.id },
                data: {
                    balance: newBalance,
                    profit: newProfit,
                    lastPaymentDate: new Date(settlementDate), // Consider if this should be last customer or last overall payment
                }
            });

            // 7. Create Audit Logs
            await createAuditLog(tx, {
                userId,
                modelName: 'SupplierPayable',
                recordId: payable.id,
                action: ActionType.SETTLEMENT_PAYMENT,
                changes: [{
                    fieldName: 'payableStatus',
                    oldValue: payable.status,
                    newValue: updatedPayableRecord.status
                },
                {
                    fieldName: 'supplierPayableSettled',
                    oldValue: `Pending: ${pendingAmount.toFixed(2)}`,
                    newValue: `Paid: ${paymentAmount.toFixed(2)} (New Pending: ${newPendingAmountForPayable.toFixed(2)})`
                }]
            });

            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: currentBooking.id,
                action: ActionType.SETTLEMENT_PAYMENT,
                changes: [
                    {
                        fieldName: 'profit',
                        oldValue: oldBookingProfit !== undefined ? oldBookingProfit.toFixed(2) : 'N/A',
                        newValue: newProfit.toFixed(2)
                    },
                    {
                        fieldName: 'balance',
                        oldValue: oldBookingBalance !== undefined ? oldBookingBalance.toFixed(2) : 'N/A',
                        newValue: newBalance.toFixed(2)
                    }
                ]
            });

            return { updatedPayable: updatedPayableRecord, updatedBooking: updatedBookingRecord };
        }, {
            timeout: 10000 // Increase transaction timeout to 10 seconds
        }); // End of prisma.$transaction

        return apiResponse.success(res, result, 201);

    } catch (error) {
        console.error('Error creating supplier payable settlement:', error);
        if (error.message.includes('not found')) return apiResponse.error(res, error.message, 404);
        if (error.message.includes('exceeds pending amount')) return apiResponse.error(res, error.message, 400);
        if (error.message.includes('Invalid')) return apiResponse.error(res, error.message, 400); // Catch explicit validation errors
        if (error.name === 'PrismaClientValidationError') return apiResponse.error(res, `Invalid data provided: ${error.message}`, 400);
        return apiResponse.error(res, `Failed to create payable settlement: ${error.message}`, 500);
    }
};


const settleCustomerPayable = async (req, res) => {
    const { id: userId } = req.user;
    const payableId = parseInt(req.params.id);
    const { amount, transactionMethod, paymentDate } = req.body;

    try {
        const paymentAmount = parseFloat(amount);

        // 1. Validation
        if (isNaN(payableId)) {
            return apiResponse.error(res, 'Invalid payable ID', 400);
        }
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return apiResponse.error(res, 'Amount must be a positive number.', 400);
        }
        if (!transactionMethod || !paymentDate) {
            return apiResponse.error(res, 'Missing transactionMethod or paymentDate.', 400);
        }
        if (isNaN(new Date(paymentDate).getTime())) {
            return apiResponse.error(res, 'Invalid payment date.', 400);
        }
        const validTransactionMethods = ['LOYDS', 'STRIPE', 'WISE', 'HUMM', 'CREDIT_NOTES', 'CREDIT', 'BANK_TRANSFER'];
        if (!validTransactionMethods.includes(transactionMethod)) {
          return apiResponse.error(res, `Invalid transactionMethod. Must be one of: ${validTransactionMethods.join(', ')}`, 400);
        }

        const result = await prisma.$transaction(async (tx) => {
            // 2. Fetch the CustomerPayable and its associated Booking with ALL necessary relations
            const payable = await tx.customerPayable.findUnique({
                where: { id: payableId },
                include: {
                    booking: {
                        include: {
                            initialPayments: true,
                            instalments: { include: { payments: true } },
                            // We don't need to include payable settlements here if we're re-fetching them below
                            // customerPayables: { include: { settlements: true } }, 
                        }
                    }
                }
            });

            if (!payable) {
                throw new Error('Payable record not found.');
            }
            if (!payable.booking) {
                throw new Error('Associated booking not found.');
            }
            const currentBooking = payable.booking;

            const pendingAmount = parseFloat(payable.pendingAmount ?? 0) || 0; // Use ?? 0 for safety
            if (paymentAmount > pendingAmount + 0.01) {
                throw new Error(`Payment amount (£${paymentAmount.toFixed(2)}) exceeds pending balance (£${pendingAmount.toFixed(2)}).`);
            }

            // 3. Create the new settlement history record
            const newCustomerPayableSettlement = await tx.customerPayableSettlement.create({
                data: {
                    customerPayableId: payableId,
                    amount: paymentAmount,
                    transactionMethod,
                    paymentDate: new Date(paymentDate),
                },
            });

            // 4. Update the parent CustomerPayable record's amounts and status
            const newPaidAmountForPayable = (parseFloat(payable.paidAmount ?? 0) || 0) + paymentAmount; // Use ?? 0 for safety
            const newPendingAmountForPayable = pendingAmount - paymentAmount;
            
            const updatedPayableRecord = await tx.customerPayable.update({
                where: { id: payableId },
                data: {
                    paidAmount: newPaidAmountForPayable,
                    pendingAmount: newPendingAmountForPayable,
                    status: newPendingAmountForPayable < 0.01 ? 'PAID' : 'PENDING',
                },
                include: { settlements: true }
            });

            // 5. Recalculate Booking's comprehensive Total Received and Balance from scratch
            const totalInitialPayments = (currentBooking.initialPayments || []).reduce((sum, p) => sum + p.amount, 0);
            const totalInstalmentPayments = (currentBooking.instalments || []).reduce((sum, inst) => 
                sum + (inst.payments || []).reduce((pSum, p) => pSum + p.amount, 0), 0);
            
            // FIX: Correctly filter `customerPayableSettlement` through the `payable` relation
            const allCustomerPayableSettlements = await tx.customerPayableSettlement.findMany({
                where: { 
                    payable: { // This refers to the 'payable' relation field in CustomerPayableSettlement
                        bookingId: currentBooking.id // This then filters on the bookingId of the related CustomerPayable
                    }
                }
            });
            const totalCustomerPayableSettlements = allCustomerPayableSettlements.reduce((sum, s) => sum + s.amount, 0);
            
            const newTotalReceived = totalInitialPayments + totalInstalmentPayments + totalCustomerPayableSettlements;
            const newBalance = (currentBooking.revenue ?? 0) - newTotalReceived; // Use ?? 0 for currentBooking.revenue

            // Store old balance for audit log
            const oldBookingBalance = currentBooking.balance ?? 0; // Use ?? 0 for safety before toFixed()

            // 6. Update the main Booking record with new balance and last payment date
            const updatedBookingRecord = await tx.booking.update({
                where: { id: currentBooking.id },
                data: {
                    balance: newBalance,
                    lastPaymentDate: new Date(paymentDate),
                }
            });

            // 7. Create Audit Logs
            await createAuditLog(tx, {
                userId,
                modelName: 'CustomerPayable',
                recordId: payable.id,
                action: ActionType.SETTLEMENT_PAYMENT,
                changes: [{
                    fieldName: 'payableStatus',
                    oldValue: payable.status,
                    newValue: updatedPayableRecord.status
                },
                {
                    fieldName: 'customerPayableSettled',
                    oldValue: `Pending: ${pendingAmount.toFixed(2)}`,
                    newValue: `Paid: ${paymentAmount.toFixed(2)} (New Pending: ${newPendingAmountForPayable.toFixed(2)})`
                }]
            });

            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: currentBooking.id,
                action: ActionType.SETTLEMENT_PAYMENT,
                changes: [{
                    fieldName: 'balance',
                    oldValue: oldBookingBalance.toFixed(2), // oldBookingBalance is now guaranteed a number
                    newValue: newBalance.toFixed(2)
                }]
            });

            // 8. Return a useful payload for frontend state update
            return { updatedPayable: updatedPayableRecord, bookingUpdate: { id: updatedBookingRecord.id, balance: updatedBookingRecord.balance, received: newTotalReceived.toFixed(2) } };
        }, {
            timeout: 10000 // Increase transaction timeout to 10 seconds
        }); // End of prisma.$transaction

        return apiResponse.success(res, result, 201);

    } catch (error) {
        console.error("Error settling customer payable:", error);
        if (error.message.includes('not found')) return apiResponse.error(res, error.message, 404);
        if (error.message.includes('exceeds pending balance')) return apiResponse.error(res, error.message, 400);
        if (error.message.includes('Invalid')) return apiResponse.error(res, error.message, 400);
        if (error.name === 'PrismaClientValidationError') return apiResponse.error(res, `Invalid data provided: ${error.message}`, 400);
        return apiResponse.error(res, `Failed to settle payable: ${error.message}`, 500);
    }
};

const recordPassengerRefund = async (req, res) => {
    const { id: userId } = req.user;
    const cancellationId = parseInt(req.params.id);
    const { amount, transactionMethod, refundDate } = req.body;

    try {
        const parsedAmount = parseFloat(amount);

        // 1. Validation
        if (isNaN(cancellationId)) {
            return apiResponse.error(res, 'Invalid Cancellation ID', 400);
        }
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return apiResponse.error(res, 'Refund amount must be a positive number', 400);
        }
        if (!transactionMethod || !refundDate) {
            return apiResponse.error(res, 'Missing transactionMethod or refundDate', 400);
        }
        if (isNaN(new Date(refundDate).getTime())) {
            return apiResponse.error(res, 'Invalid refund date', 400);
        }
        const validTransactionMethods = ['LOYDS', 'STRIPE', 'WISE', 'HUMM', 'CREDIT', 'BANK_TRANSFER']; // Removed CREDIT_NOTES as not typically used for customer refunds
        if (!validTransactionMethods.includes(transactionMethod)) {
          return apiResponse.error(res, `Invalid transactionMethod. Must be one of: ${validTransactionMethods.join(', ')}`, 400);
        }
        const refundAmount = parseFloat(amount);
        if (isNaN(refundAmount) || refundAmount < 0) { // Allow 0 refund amount if needed
             return apiResponse.error(res, 'Refund amount must be a non-negative number.', 400);
        }


        const result = await prisma.$transaction(async (tx) => {
            // Fetch cancellation, booking, AND the potentially generated customer credit note
            const cancellation = await tx.cancellation.findUnique({
                where: { id: cancellationId },
                include: {
                    originalBooking: true,
                    generatedCustomerCreditNote: true // Include the linked credit note
                }
            });

            if (!cancellation) throw new Error('Cancellation record not found.');
            // Allow recording a £0 payment even if already 'PAID' or 'CREDIT_ISSUED',
            // But prevent recording a > £0 payment if already 'PAID'
            if (cancellation.refundStatus === 'PAID' && refundAmount > 0) {
                 throw new Error('This refund has already been marked as paid.');
            }
            // Optional: Check if refundAmount matches cancellation.refundToPassenger
            // if (Math.abs(refundAmount - cancellation.refundToPassenger) > 0.01) {
            //    console.warn(`Recorded refund amount (£${refundAmount}) differs from calculated due (£${cancellation.refundToPassenger})`);
            // }


            // --- AUDIT LOGS (Log changes first) ---
            // Log outgoing refund payment on the original Booking's history.
            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: cancellation.originalBookingId,
                action: ActionType.REFUND_PAYMENT,
                changes: [{
                    fieldName: 'passengerRefund',
                    oldValue: `Status: ${cancellation.refundStatus}, Due: ${cancellation.refundToPassenger.toFixed(2)}`,
                    newValue: `Paid refund of ${refundAmount.toFixed(2)} via ${transactionMethod}`
                }]
            });

            // Log the status change on the Cancellation record itself
            await createAuditLog(tx, {
                userId,
                modelName: 'Cancellation',
                recordId: cancellation.id,
                action: ActionType.UPDATE,
                changes: [{
                    fieldName: 'refundStatus',
                    oldValue: cancellation.refundStatus,
                    newValue: 'PAID' // Marking as PAID because cash was given
                }]
            });
            // --- END AUDIT LOGS ---


            // --- NEW: Update Customer Credit Note if it exists ---
            if (cancellation.generatedCustomerCreditNote) {
                await tx.customerCreditNote.update({
                    where: { id: cancellation.generatedCustomerCreditNote.id },
                    data: {
                        remainingAmount: 0, // Zero out remaining amount
                        status: 'USED' // Mark as used (or maybe 'VOIDED_BY_REFUND')
                    }
                });

                // Optional: Log the credit note update
                 await createAuditLog(tx, {
                    userId, modelName: 'CustomerCreditNote', recordId: cancellation.generatedCustomerCreditNote.id,
                    action: ActionType.UPDATE, changes: [
                        { fieldName: 'status', oldValue: cancellation.generatedCustomerCreditNote.status, newValue: 'USED' },
                        { fieldName: 'remainingAmount', oldValue: cancellation.generatedCustomerCreditNote.remainingAmount, newValue: 0 },
                        { fieldName: 'reason', newValue: 'Voided due to cash refund processing.'}
                    ]
                 });
            }
            // --- END Credit Note Update ---


            // 1. Create the payment record (handle potential existing record for £0 updates)
            const refundPayment = await tx.passengerRefundPayment.upsert({
                where: { cancellationId: parseInt(cancellationId) }, // Unique constraint
                update: { // If it exists (e.g., updating a £0 entry)
                    amount: refundAmount,
                    transactionMethod,
                    refundDate: new Date(refundDate),
                },
                create: { // If it doesn't exist
                    cancellationId: parseInt(cancellationId),
                    amount: refundAmount,
                    transactionMethod,
                    refundDate: new Date(refundDate),
                },
            });

            // 2. Update the cancellation status to PAID
            await tx.cancellation.update({
                where: { id: cancellationId },
                data: { refundStatus: 'PAID' },
            });

            // 5. Recalculate the Original Booking's Total Received and Balance (Comprehensive)

            // Sum all initial payments received
            const totalInitialPayments = (originalBooking.initialPayments || []).reduce((sum, p) => sum + p.amount, 0);

            // Sum all payments made to all instalments
            const totalInstalmentPayments = (originalBooking.instalments || []).reduce((sum, inst) => 
                sum + (inst.payments || []).reduce((pSum, p) => pSum + p.amount, 0), 0);

            // Sum all customer payable settlements (money received for cancellation debts)
            const totalCustomerPayableSettlements = (originalBooking.customerPayables || []).reduce((sum, payable) => 
                sum + (payable.settlements || []).reduce((sSum, s) => sSum + s.amount, 0), 0);
            
            // Sum all passenger refund payments (money paid OUT to customer)
            // Need to re-fetch cancellation and its refunds to include the one just made
            const allPassengerRefundsForBooking = await tx.passengerRefundPayment.findMany({
                where: { cancellation: { originalBookingId: originalBooking.id } }
            });
            const totalPassengerRefundsPaid = (allPassengerRefundsForBooking || []).reduce((sum, rp) => sum + rp.amount, 0);


            // newTotalReceived is the net amount received from the customer
            const newTotalReceived = totalInitialPayments + totalInstalmentPayments + totalCustomerPayableSettlements - totalPassengerRefundsPaid;
            const newBalance = (originalBooking.revenue || 0) - newTotalReceived;

            // Store old balance for audit log
            const oldBookingBalance = originalBooking.balance;

            // 6. Update the main Booking record with new balance and last payment date
            const updatedBookingRecord = await tx.booking.update({
                where: { id: originalBooking.id },
                data: {
                    balance: newBalance,
                    lastPaymentDate: new Date(refundDate), // Update last payment date (as money moved)
                }
            });

            // 7. Create Audit Logs
            await createAuditLog(tx, {
                userId,
                modelName: 'Cancellation',
                recordId: cancellation.id,
                action: ActionType.UPDATE, // Action on the cancellation record
                changes: [{
                    fieldName: 'refundStatus',
                    oldValue: cancellation.refundStatus,
                    newValue: 'PAID'
                },
                {
                    fieldName: 'passengerRefundPayment',
                    oldValue: `Owed: ${(cancellation.refundToPassenger || 0).toFixed(2)}`, // <-- FIX APPLIED HERE
                    newValue: `Paid: ${parsedAmount.toFixed(2)} via ${transactionMethod}`
                }]
            });

            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: originalBooking.id,
                action: ActionType.REFUND_PAYMENT, // Specific action for booking
                changes: [{
                    fieldName: 'balance',
                    oldValue: typeof oldBookingBalance === 'number' ? oldBookingBalance.toFixed(2) : 'N/A', // <-- FIX APPLIED HERE
                    newValue: newBalance.toFixed(2)
                }]
            });

            // 8. Return a useful payload for frontend state update
            return { refundPayment: refundPayment, bookingUpdate: { id: updatedBookingRecord.id, balance: updatedBookingRecord.balance, received: newTotalReceived.toFixed(2) } };
        }, {
            timeout: 10000 // Increase transaction timeout to 10 seconds
        }); // End of prisma.$transaction

        return apiResponse.success(res, result, 201);
    } catch (error) {
        console.error("Error recording passenger refund:", error);
        if (error.message.includes('not found') || error.message.includes('already been paid') || error.message.includes('exceeds the amount owed')) {
            return apiResponse.error(res, error.message, 400);
        }
        if (error.message.includes('Invalid')) return apiResponse.error(res, error.message, 400); // Catch explicit validation errors
        if (error.name === 'PrismaClientValidationError') return apiResponse.error(res, `Invalid data provided: ${error.message}`, 400);
        return apiResponse.error(res, `Failed to record refund: ${error.message}`, 500);
    }
};


const voidBooking = async (req, res) => {
    const bookingId = parseInt(req.params.id);
    const { reason } = req.body;
    const { id: userId } = req.user;

    // 1. Validation
    if (isNaN(bookingId)) {
        return apiResponse.error(res, 'Invalid booking ID', 400);
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
        return apiResponse.error(res, 'A reason (string) is required to void a booking.', 400);
    }

    try {
        const updatedBooking = await prisma.$transaction(async (tx) => {
            const bookingToVoid = await tx.booking.findUnique({ where: { id: bookingId } });

            if (!bookingToVoid) {
                throw new Error('Booking not found');
            }
            if (bookingToVoid.bookingStatus === 'VOID') {
                throw new Error('Booking is already voided');
            }
            if (bookingToVoid.bookingStatus === 'CANCELLED') {
                // Prevent voiding a cancelled booking, as cancellation has its own audit trail and financial implications
                throw new Error('Cannot void a cancelled booking. Consider "unvoiding" it first if intent is to modify, or use cancellation reversal if applicable.');
            }

            // Store old status and financial values for audit
            const oldBookingStatus = bookingToVoid.bookingStatus;
            const oldVoidReason = bookingToVoid.voidReason; // Will be null usually
            const oldVoidedAt = bookingToVoid.voidedAt;
            const oldVoidedById = bookingToVoid.voidedById;


            const voidedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: {
                    bookingStatus: 'VOID',
                    statusBeforeVoid: oldBookingStatus, // Store the original status
                    voidReason: reason.trim(), // Trim whitespace
                    voidedAt: new Date(),
                    voidedById: userId,
                },
            });

            // 2. Audit Log
            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: voidedBooking.id,
                action: ActionType.VOID_BOOKING,
                changes: [
                    { fieldName: 'bookingStatus', oldValue: oldBookingStatus, newValue: 'VOID' },
                    { fieldName: 'statusBeforeVoid', oldValue: oldBookingStatus, newValue: oldBookingStatus }, // Log that it was saved
                    { fieldName: 'voidReason', oldValue: oldVoidReason, newValue: reason.trim() },
                    { fieldName: 'voidedAt', oldValue: oldVoidedAt?.toISOString() || null, newValue: voidedBooking.voidedAt.toISOString() },
                    { fieldName: 'voidedById', oldValue: oldVoidedById, newValue: userId },
                ],
            });

            // Financial impact: When voiding, the booking is essentially "inactive" for new financial flows.
            // The existing balance and profit are kept as is for historical reference.
            // Any reporting or dashboards would typically filter out or explicitly handle 'VOID' bookings.

            return voidedBooking;
        }, {
            timeout: 10000 // Increase transaction timeout to 10 seconds
        });

        return apiResponse.success(res, updatedBooking, 200, "Booking voided successfully.");
    } catch (error) {
        console.error("Error voiding booking:", error);
        if (error.message.includes('not found')) return apiResponse.error(res, error.message, 404);
        if (error.message.includes('already voided') || error.message.includes('Cannot void a cancelled booking')) return apiResponse.error(res, error.message, 409); // Conflict for already voided/cancelled
        return apiResponse.error(res, `Failed to void booking: ${error.message}`, 500);
    }
};

const unvoidBooking = async (req, res) => {
    const bookingId = parseInt(req.params.id);
    const { id: userId } = req.user;

    // 1. Validation
    if (isNaN(bookingId)) {
        return apiResponse.error(res, 'Invalid booking ID', 400);
    }

    try {
        const updatedBooking = await prisma.$transaction(async (tx) => {
            const bookingToUnvoid = await tx.booking.findUnique({ where: { id: bookingId } });

            if (!bookingToUnvoid) {
                throw new Error('Booking not found');
            }
            if (bookingToUnvoid.bookingStatus !== 'VOID') {
                throw new Error('Booking is not voided');
            }
            if (!bookingToUnvoid.statusBeforeVoid) {
                throw new Error('Cannot unvoid: original status is unknown. Data integrity error.');
            }

            // Store old status and void-related fields for audit
            const oldBookingStatus = bookingToUnvoid.bookingStatus; // 'VOID'
            const oldStatusBeforeVoid = bookingToUnvoid.statusBeforeVoid;
            const oldVoidReason = bookingToUnvoid.voidReason;
            const oldVoidedAt = bookingToUnvoid.voidedAt;
            const oldVoidedById = bookingToUnvoid.voidedById;

            const unvoidedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: {
                    bookingStatus: bookingToUnvoid.statusBeforeVoid, // Restore original status
                    statusBeforeVoid: null, // Clear void-related fields
                    voidReason: null,
                    voidedAt: null,
                    voidedById: null,
                },
            });

            // 2. Audit Log
            await createAuditLog(tx, {
                userId,
                modelName: 'Booking',
                recordId: unvoidedBooking.id,
                action: ActionType.UNVOID_BOOKING,
                changes: [
                    { fieldName: 'bookingStatus', oldValue: oldBookingStatus, newValue: unvoidedBooking.bookingStatus },
                    { fieldName: 'statusBeforeVoid', oldValue: oldStatusBeforeVoid, newValue: null },
                    { fieldName: 'voidReason', oldValue: oldVoidReason, newValue: null },
                    { fieldName: 'voidedAt', oldValue: oldVoidedAt?.toISOString() || null, newValue: null },
                    { fieldName: 'voidedById', oldValue: oldVoidedById, newValue: null },
                ],
            });

            // Financial impact: Restoring status doesn't change core financials.
            // The booking's original balance and profit are simply now active again.

            return unvoidedBooking;
        }, {
            timeout: 10000 // Increase transaction timeout to 10 seconds
        });

        return apiResponse.success(res, updatedBooking, 200, "Booking has been restored.");
    } catch (error) {
        console.error("Error unvoiding booking:", error);
        if (error.message.includes('not found')) return apiResponse.error(res, error.message, 404);
        if (error.message.includes('not voided') || error.message.includes('original status is unknown')) return apiResponse.error(res, error.message, 409); // Conflict for not voided
        return apiResponse.error(res, `Failed to unvoid booking: ${error.message}`, 500);
    }
};

const generateInvoice = async (req, res) => {
    const { id } = req.params;
    const userId = req.user ? req.user.id : 'SYSTEM';

    try {
        const bookingId = parseInt(id);
        
        // Fetch all booking data needed for the invoice in one go
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { 
                passengers: true, 
                initialPayments: true,
                instalments: {
                    include: {
                        payments: true
                    }
                }
            },
        });

        if (!booking) {
            return apiResponse.error(res, 'Booking not found', 404);
        }

        let invoiceNumber = booking.invoiced;

        if (!invoiceNumber) {
            await prisma.$transaction(async (tx) => {
                invoiceNumber = await generateNextInvoiceNumber(tx);
                
                await tx.booking.update({
                    where: { id: bookingId },
                    data: { invoiced: invoiceNumber },
                });

                await createAuditLog(tx, {
                    userId,
                    modelName: 'Booking',
                    recordId: bookingId,
                    action: ActionType.GENERATE_INVOICE,
                    newValue: `Generated invoice ${invoiceNumber}`,
                });
            });
        }
        
        const updatedBooking = { ...booking, invoiced: invoiceNumber };

        const totalReceived = (booking.initialPayments || []).reduce((sum, p) => sum + p.amount, 0) +
                              (booking.instalments || []).reduce((sum, inst) => sum + (inst.payments || []).reduce((pSum, p) => pSum + p.amount, 0), 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceNumber}.pdf`);

        // Now this call should work correctly
        createInvoicePdf(
            updatedBooking, 
            totalReceived,
            (chunk) => res.write(chunk),
            () => res.end()
        );

    } catch (error) {
        console.error("Error generating invoice:", error);
        return apiResponse.error(res, "Failed to generate invoice: " + error.message, 500);
    }
};

const updateAccountingMonth = async (req, res) => {
    const { id } = req.params;
    const { accountingMonth } = req.body;
    const { id: userId } = req.user;

    try {
        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) }});

        const updatedBooking = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { accountingMonth: new Date(accountingMonth) },
        });

        await createAuditLog(prisma, {
            userId,
            modelName: 'Booking',
            recordId: updatedBooking.id,
            action: ActionType.UPDATE_ACCOUNTING_MONTH,
            fieldName: 'accountingMonth',
            oldValue: booking.accountingMonth,
            newValue: updatedBooking.accountingMonth,
        });

        return apiResponse.success(res, updatedBooking, 200, "Accounting month updated.");
    } catch (error) {
        console.error("Error updating accounting month:", error);
        return apiResponse.error(res, "Failed to update month: " + error.message, 500);
    }
};

const updateCommissionAmount = async (req, res) => {
    // Now expecting recordType from the body as well
    const { recordId, recordType, commissionAmount } = req.body;
    const { id: userId } = req.user;

    if (!recordId || !recordType || commissionAmount === undefined) {
        return apiResponse.error(res, "Missing required fields.", 400);
    }

    try {
        let updatedRecord;
        let originalRecord;

        if (recordType === 'booking') {
            originalRecord = await prisma.booking.findUnique({ where: { id: parseInt(recordId) } });
            updatedRecord = await prisma.booking.update({
                where: { id: parseInt(recordId) },
                data: { commissionAmount: parseFloat(commissionAmount) },
            });
        } else if (recordType === 'cancellation') {
            originalRecord = await prisma.cancellation.findUnique({ where: { id: parseInt(recordId) } });
            updatedRecord = await prisma.cancellation.update({
                where: { id: parseInt(recordId) },
                data: { commissionAmount: parseFloat(commissionAmount) },
            });
        } else {
            return apiResponse.error(res, "Invalid record type provided.", 400);
        }

        await createAuditLog(prisma, {
            userId,
            modelName: recordType === 'booking' ? 'Booking' : 'Cancellation',
            recordId: updatedRecord.id,
            action: ActionType.UPDATE_COMMISSION_AMOUNT,
            fieldName: 'commissionAmount',
            oldValue: originalRecord.commissionAmount,
            newValue: updatedRecord.commissionAmount,
        });

        return apiResponse.success(res, updatedRecord, 200, "Commission amount updated.");
    } catch (error) {
        console.error("Error updating commission amount:", error);
        return apiResponse.error(res, "Failed to update commission amount: " + error.message, 500);
    }
};

const getCustomerCreditNotes = async (req, res) => {
    // Expect 'originalBookingId' as a query parameter
    const { originalBookingId } = req.query;

    if (!originalBookingId || isNaN(parseInt(originalBookingId))) { // Validate it's a number
        return apiResponse.error(res, 'Original Booking ID (originalBookingId) query parameter is required and must be a number.', 400);
    }

    const bookingIdInt = parseInt(originalBookingId);

    try {
        // Find cancellations linked directly to the original booking ID
        const cancellations = await prisma.cancellation.findMany({
            where: {
                originalBookingId: bookingIdInt // Filter directly by the ID
            },
            select: {
                id: true // Select only the cancellation ID
            }
        });

        if (cancellations.length === 0) {
            // If no cancellations match, there can be no credit notes
            return apiResponse.success(res, []);
        }

        const cancellationIds = cancellations.map(c => c.id);

        // Now find available credit notes generated from these cancellations
        const availableNotes = await prisma.customerCreditNote.findMany({
            where: {
                generatedFromCancellationId: { in: cancellationIds }, // Filter by the found cancellation IDs
                status: { in: ['AVAILABLE', 'PARTIALLY_USED'] },
                remainingAmount: { gt: 0 }
            },
            include: {
                generatedFromCancellation: {
                    select: {
                        folderNo: true,
                        // Include original RefNo if needed for display in the selection popup
                        originalBooking: { select: { refNo: true } }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return apiResponse.success(res, availableNotes);

    } catch (error) {
        console.error('Error fetching available customer credit notes by Booking ID:', error);
        return apiResponse.error(res, `Failed to fetch customer credit notes: ${error.message}`, 500);
    }
};

const writeOffBookingBalance = async (req, res) => {
  const { id: userId } = req.user;
  const bookingId = parseInt(req.params.id);
  const { reason } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          initialPayments: true,
          instalments: { include: { payments: true } },
          customerPayables: { include: { settlements: true } },
          amendments: { where: { isReversed: false } },
          commissionEntries: { where: { type: 'INITIAL' } },
          agent: true
        }
      });

      if (!booking) throw new Error('Booking not found');
      const currentBalance = parseFloat(booking.balance || 0);

      const amendment = await tx.bookingAmendment.create({
        data: {
          bookingId: booking.id,
          userId: userId,
          type: 'WRITE_OFF',
          propertyName: 'balance',
          oldValue: currentBalance,
          newValue: 0,
          difference: -currentBalance,
          reason: reason
        }
      });

      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          balance: 0,
          bookingStatus: 'COMPLETED'
        }
      });

      const existingReconciliation = await tx.commissionLedger.findFirst({
          where: { bookingId: booking.id, type: 'FINAL_RECONCILIATION' }
      });

      if (!existingReconciliation) {
          const initialPaid = booking.commissionEntries[0]?.amount || 0;
          const totalIn = booking.initialPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
          const totalInst = booking.instalments.reduce((s, i) => s + i.payments.reduce((ps, p) => ps + parseFloat(p.amount || 0), 0), 0);
          const totalPay = booking.customerPayables.reduce((s, cp) => s + cp.settlements.reduce((ss, s) => ss + parseFloat(s.amount || 0), 0), 0);
          const totalAdj = booking.amendments.reduce((s, a) => s + parseFloat(a.difference || 0), 0) + (-currentBalance);

          const finalProfit = (parseFloat(booking.revenue) - parseFloat(booking.prodCost)) + totalAdj;
          const reconciliationAmount = finalProfit - initialPaid;

          let finalAgentId = booking.agentId;
          if (!finalAgentId) {
              const agentUser = await tx.user.findFirst({
                  where: { firstName: booking.agentName.split(' ')[0] }
              });
              finalAgentId = agentUser?.id;
          }

          if (finalAgentId && Math.abs(reconciliationAmount) > 0.01) {
              await tx.commissionLedger.create({
                data: {
                  bookingId: booking.id,
                  agentId: finalAgentId,
                  type: 'FINAL_RECONCILIATION',
                  amount: reconciliationAmount,
                  commissionMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              });
          }
      }

      return { updatedBooking, amendment };
    });

    return apiResponse.success(res, result);
  } catch (error) {
    console.error("Write-off Error:", error);
    return apiResponse.error(res, error.message, 400);
  }
};

const reverseAmendment = async (req, res) => {
    const { id: userId } = req.user;
    const amendmentId = parseInt(req.params.amendmentId);

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch amendment with full booking details for math
            const amendment = await tx.bookingAmendment.findUnique({
                where: { id: amendmentId },
                include: { 
                    booking: { 
                        include: { 
                            initialPayments: true, 
                            instalments: { include: { payments: true } },
                            customerPayables: { include: { settlements: true } },
                            amendments: true 
                        } 
                    }
                }
            });

            if (!amendment || amendment.isReversed) throw new Error('Amendment not found or already reversed.');

            // 2. Mark as reversed
            await tx.bookingAmendment.update({
                where: { id: amendmentId },
                data: { isReversed: true }
            });

            // 3. Recalculate Balance ignoring the newly reversed amendment
            const booking = amendment.booking;
            const totalIn = (booking.initialPayments || []).reduce((s, p) => s + p.amount, 0);
            const totalInst = (booking.instalments || []).reduce((s, i) => s + (i.payments || []).reduce((ps, p) => ps + p.amount, 0), 0);
            const totalPay = (booking.customerPayables || []).reduce((s, cp) => s + (cp.settlements || []).reduce((ss, s) => ss + s.amount, 0), 0);
            
            // Sum only active amendments (this excludes the one we just reversed)
            const totalAdj = (booking.amendments || [])
                .filter(a => a.id !== amendmentId && !a.isReversed)
                .reduce((s, a) => s + a.difference, 0);

            const netReceived = totalIn + totalInst + totalPay;
            const restoredBalance = (booking.revenue || 0) - netReceived + totalAdj;

            // 4. Update the Booking
            const updatedBooking = await tx.booking.update({
                where: { id: booking.id },
                data: {
                    balance: restoredBalance,
                    bookingStatus: restoredBalance > 0 ? 'CONFIRMED' : 'COMPLETED'
                }
            });

            return updatedBooking;
        });

        return apiResponse.success(res, result);
    } catch (error) {
        return apiResponse.error(res, error.message, 400);
    }
};

const updateCommissionMonth = async (req, res) => {
  const { id } = req.params;
  const { commissionMonth } = req.body;

  try {
    const updatedEntry = await prisma.commissionLedger.update({
      where: { id: parseInt(id) },
      data: {
        commissionMonth: new Date(commissionMonth),
      },
    });

    return apiResponse.success(res, updatedEntry);
  } catch (error) {
    console.error('Error updating commission month:', error);
    return apiResponse.error(res, 'Failed to update month', 500);
  }
};

// Function to fetch the ledger entries for the Agent Commissions page
const getAgentCommissions = async (req, res) => {
  const { month } = req.query;

  try {
    const startOfMonth = new Date(`${month}-01T00:00:00Z`);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const entries = await prisma.commissionLedger.findMany({
      where: {
        commissionMonth: { gte: startOfMonth, lt: endOfMonth },
      },
      include: {
        booking: {
          select: {
            folderNo: true,
            paxName: true,
            revenue: true,
            paymentMethod: true,
            prodCost: true,
            commissionEntries: {
              where: { type: 'INITIAL' },
              select: { amount: true }
            }
          }
        },
        agent: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedEntries = entries.map(entry => {
      const initialPaid = entry.booking.commissionEntries[0]?.amount || 0;
      return {
        ...entry,
        initialPaid: entry.type === 'FINAL_RECONCILIATION' ? initialPaid : 0,
      };
    });

    return apiResponse.success(res, formattedEntries);
  } catch (error) {
    console.error('Error fetching commissions:', error);
    return apiResponse.error(res, 'Failed to fetch commissions', 500);
  }
};



module.exports = {
  createPendingBooking,
  getPendingBookings,
  approveBooking,
  rejectBooking,
  createBooking,
  getBookings,
  updateBooking,
  getDashboardStats,
  getAttentionBookings,
  getOverdueBookings,
  getRecentBookings,
  getCustomerDeposits,
  updateInstalment,
  getSuppliersInfo,
  createSupplierPaymentSettlement,
  updatePendingBooking,
  recordSettlementPayment,
  getTransactions,
  createCancellation,
  getAvailableCreditNotes,
  createDateChangeBooking,
  createSupplierPayableSettlement,
  settleCustomerPayable,
  recordPassengerRefund,
  voidBooking,
  unvoidBooking,
  generateInvoice,
  updateAccountingMonth,
  updateCommissionAmount,
  getCustomerCreditNotes,
  writeOffBookingBalance,
  reverseAmendment,
  getAgentCommissions,
  updateCommissionMonth
};