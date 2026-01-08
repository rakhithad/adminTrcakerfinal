const syncInitialCommission = async (tx, bookingId) => {
    // 1. Fetch booking with current math
    const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { commissionEntries: { where: { type: 'INITIAL' } } }
    });

    if (!booking || booking.bookingStatus === 'VOID') return;

    const profit = parseFloat(booking.revenue || 0) - parseFloat(booking.prodCost || 0);
    
    // Logic: 100% for FULL, 50% for INTERNAL
    const targetAmount = booking.paymentMethod.includes('FULL') ? profit : (profit / 2);

    if (booking.commissionEntries.length > 0) {
        // Update existing row if not already locked by a final reconciliation
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
        // Create new Initial row if it doesn't exist
        await tx.commissionLedger.create({
            data: {
                bookingId: booking.id,
                agentId: booking.agentId, // Ensure your booking model has agentId
                type: 'INITIAL',
                amount: targetAmount,
                commissionMonth: booking.pcDate // Default to PC Date
            }
        });
    }
};