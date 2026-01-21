// server/utils/commission.js

const syncCommissionWithProfit = async (tx, bookingId) => {
    // 1. Fetch booking
    const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { 
            commissionEntries: true,
            costItems: { include: { suppliers: { include: { settlements: true } } } },
            amendments: { where: { isReversed: false } }
        }
    });

    if (!booking) return;

    // --- Resolve Agent ID ---
    let finalAgentId = booking.agentId;
    if (!finalAgentId && booking.agentName) {
        const agentUser = await tx.user.findFirst({
            where: { 
                OR: [
                    { firstName: { contains: booking.agentName.split(' ')[0], mode: 'insensitive' } },
                    { lastName: { contains: booking.agentName.split(' ')[0], mode: 'insensitive' } }
                ]
            }
        });
        finalAgentId = agentUser?.id;
    }
    if (!finalAgentId) return;

    // 2. Determine Cost
    const totalSupplierCosts = booking.costItems.reduce((acc, ci) => {
        return acc + ci.suppliers.reduce((sAcc, s) => sAcc + (s.amount || 0), 0);
    }, 0);

    const costToUse = (booking.prodCost !== null && booking.prodCost !== undefined) 
        ? parseFloat(booking.prodCost) 
        : totalSupplierCosts;

    // 3. Calculate "Amendment Impact"
    const amendmentImpact = booking.amendments.reduce((sum, am) => sum + (am.difference || 0), 0);
    
    // 4. Calculate Effective Profit
    const originalProfit = (parseFloat(booking.revenue) || 0) - costToUse - (booking.transFee || 0) - (booking.surcharge || 0);
    const effectiveProfit = originalProfit + amendmentImpact;

    // 5. Calculate what has already been paid
    const alreadyPaidToAgent = booking.commissionEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // 6. Determine Target Commission
    const paymentMethod = booking.paymentMethod || '';
    const isFullProfit = paymentMethod.includes('FULL') || paymentMethod.includes('INTERNAL');

    const targetCommission = isFullProfit ? effectiveProfit : (effectiveProfit / 2);

    const adjustmentNeeded = targetCommission - alreadyPaidToAgent;

    // 7. Create Adjustment Entry (ALWAYS, even if 0)
    // I removed the "if (Math.abs(adjustmentNeeded) >= 0.01)" check.
    await tx.commissionLedger.create({
        data: {
            bookingId: booking.id,
            agentId: finalAgentId,
            folderNo: booking.folderNo,
            type: 'ADJUSTMENT', 
            amount: adjustmentNeeded, // This will store 0
            commissionMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            // Explicitly stating the logic in the description helps the user understand WHY it is 0
            description: `Reconciliation: Profit ${effectiveProfit.toFixed(2)} vs Paid ${alreadyPaidToAgent.toFixed(2)}`
        }
    });
};

module.exports = { syncCommissionWithProfit };