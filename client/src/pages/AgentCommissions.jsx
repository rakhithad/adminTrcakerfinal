import React, { useState, useEffect } from 'react';
import { 
  FaCalendarAlt, 
  FaMoneyBillWave, 
  FaChartLine, 
  FaUserTie, 
  FaSpinner, 
  FaEdit, 
  FaCheckCircle, 
  FaRegCircle,
  FaInfoCircle,
  FaExchangeAlt
} from 'react-icons/fa';
import { 
  getAgentCommissions, 
  updateCommissionMonth, 
  toggleCommissionSettlement 
} from '../api/api';

// --- HELPER COMPONENTS ---

const StatCard = ({ icon, title, value, colorClass }) => (
    <div className={`flex items-center p-4 bg-white shadow-lg rounded-xl border-l-4 ${colorClass}`}>
        <div className={`p-3 rounded-full bg-opacity-20 ${colorClass.replace('border-', 'bg-').replace('500', '100')}`}>
            {icon}
        </div>
        <div className="ml-4">
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900">£{value}</p>
        </div>
    </div>
);

const TypeBadge = ({ type }) => {
    const styles = {
        'INITIAL': 'bg-blue-100 text-blue-800 border-blue-200',
        'FINAL_RECONCILIATION': 'bg-green-100 text-green-800 border-green-200',
        'ADJUSTMENT': 'bg-orange-100 text-orange-800 border-orange-200',
        'CANCELLATION': 'bg-red-100 text-red-800 border-red-200'
    };
    const label = type.replace('_', ' ');
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles[type] || 'bg-gray-100 text-gray-800'}`}>
            {label}
        </span>
    );
};

// --- MAIN TABLE COMPONENT ---

const CommissionTable = ({ title, data, subTitle, onEditMonth, onToggleSettled, isSettledTable }) => {
    // Calculate Totals
    const totals = data.reduce((acc, row) => ({
        profit: acc.profit + ((parseFloat(row.displayRevenue) || 0) - (parseFloat(row.booking?.prodCost) || 0)),
        initial: acc.initial + parseFloat(row.initialPaid || 0),
        comm: acc.comm + parseFloat(row.amount || 0)
    }), { profit: 0, initial: 0, comm: 0 });

    return (
        <div className="bg-white shadow-lg rounded-xl overflow-hidden mb-8 border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <p className="text-sm text-slate-500">{subTitle}</p>
                </div>
                <span className="text-xs font-semibold bg-white border border-slate-300 px-3 py-1 rounded-full text-slate-600">
                    {data.length} Records
                </span>
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100 text-slate-600">
                        <tr>
                            <th className="px-4 py-3 text-center w-12"><FaCheckCircle className="mx-auto" /></th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Month / Ref</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Details & Reason</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Pax / Agent</th>
                            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Profit Base</th>
                            {isSettledTable && <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Paid Previously</th>}
                            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">
                                {isSettledTable ? 'Final Payout' : 'Commission'}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-sm">
                        {data.map((row) => {
                            const revenue = parseFloat(row.displayRevenue || 0);
                            const cost = parseFloat(row.booking?.prodCost || 0);
                            const profit = revenue - cost;
                            const isNegative = row.amount < 0;

                            return (
                                <tr key={row.id} className={`transition-colors ${row.isSettled ? 'bg-green-50/40' : 'hover:bg-blue-50/20'}`}>
                                    {/* 1. Paid Toggle */}
                                    <td className="px-4 py-3 text-center">
                                        <button 
                                            onClick={() => onToggleSettled(row.id, !row.isSettled)}
                                            className={`text-xl hover:scale-110 transition-transform ${row.isSettled ? 'text-green-500' : 'text-slate-300 hover:text-slate-400'}`}
                                            title={row.isSettled ? "Mark Unpaid" : "Mark Paid"}
                                        >
                                            {row.isSettled ? <FaCheckCircle /> : <FaRegCircle />}
                                        </button>
                                    </td>

                                    {/* 2. Month & Folder */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 font-bold text-slate-700">
                                                {row.folderNo || row.booking.folderNo}
                                                <button onClick={() => onEditMonth(row)} className="text-slate-300 hover:text-blue-500 ml-1">
                                                    <FaEdit size={10}/>
                                                </button>
                                            </div>
                                            <span className="text-xs text-slate-500">
                                                {new Date(row.commissionMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 3. Details & Reason (The New Column) */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <div><TypeBadge type={row.type} /></div>
                                            {row.description ? (
                                                <span className="text-xs text-slate-600 italic flex items-start gap-1">
                                                    <FaInfoCircle className="mt-0.5 text-slate-400 flex-shrink-0" size={10} />
                                                    {row.description}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-300 italic">Standard commission</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* 4. Pax & Agent */}
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{row.booking.paxName}</div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1">
                                            <FaUserTie size={10} /> {row.agent?.firstName} {row.agent?.lastName}
                                        </div>
                                    </td>

                                    {/* 5. Profit Base (Rev - Cost) */}
                                    <td className="px-4 py-3 text-right">
                                        <div className="font-medium text-slate-700">£{profit.toFixed(2)}</div>
                                        <div className="text-[10px] text-slate-400">
                                            (Rev: {revenue.toFixed(0)} - Cost: {cost.toFixed(0)})
                                        </div>
                                    </td>

                                    {/* 6. Initial Paid (Only for Settled) */}
                                    {isSettledTable && (
                                        <td className="px-4 py-3 text-right text-orange-600 font-medium">
                                            {parseFloat(row.initialPaid) !== 0 ? `£${parseFloat(row.initialPaid).toFixed(2)}` : '-'}
                                        </td>
                                    )}

                                    {/* 7. Final Amount */}
                                    <td className={`px-4 py-3 text-right font-bold ${isNegative ? 'text-red-600' : 'text-blue-700'}`}>
                                        <div className={`inline-block px-2 py-1 rounded ${isNegative ? 'bg-red-50' : 'bg-blue-50'}`}>
                                            £{parseFloat(row.amount).toFixed(2)}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    
                    {/* Totals Footer */}
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <tr>
                            <td colSpan="4" className="px-4 py-3 text-sm text-slate-800 uppercase text-right">Period Totals:</td>
                            <td className="px-4 py-3 text-sm text-right text-slate-600">£{totals.profit.toFixed(2)}</td>
                            {isSettledTable && <td className="px-4 py-3 text-sm text-right text-orange-600">£{totals.initial.toFixed(2)}</td>}
                            <td className={`px-4 py-3 text-sm text-right ${totals.comm < 0 ? 'text-red-600' : 'text-blue-800'}`}>
                                £{totals.comm.toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// --- PAGE COMPONENT ---

export default function AgentCommissions() {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ newBookings: [], settledBookings: [] });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getAgentCommissions(selectedMonth);
            const ledger = res.data.data || [];
            setData({
                // Initial and Cancellation fees go to "New"
                newBookings: ledger.filter(e => e.type === 'INITIAL' || e.type === 'CANCELLATION'),
                
                // Adjustments and Final Reconciliations go to "Settled"
                settledBookings: ledger.filter(e => e.type === 'FINAL_RECONCILIATION' || e.type === 'ADJUSTMENT')
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedMonth]);

    const handleToggleSettled = async (id, isSettled) => {
        try {
            await toggleCommissionSettlement(id, { isSettled });
            fetchData();
        } catch (alert) {
            alert("Failed to update settlement status");
        }
    };

    const handleEditMonth = async (row) => {
        const newMonth = window.prompt("Enter new month (YYYY-MM):", selectedMonth);
        if (newMonth) {
            await updateCommissionMonth(row.id, { commissionMonth: `${newMonth}-01` });
            fetchData();
        }
    };

    const totalNew = data.newBookings.reduce((s, r) => s + r.amount, 0);
    const totalSettled = data.settledBookings.reduce((s, r) => s + r.amount, 0);

    if (loading) return <div className="h-screen flex items-center justify-center"><FaSpinner className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="bg-slate-50 min-h-screen p-8">
            <div className="max-w-[1600px] mx-auto">
                <header className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <FaUserTie className="text-blue-600" /> Agent Commissions
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">Track payouts, adjustments, and final reconciliations.</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border shadow-sm">
                        <FaCalendarAlt className="text-slate-400 ml-2" />
                        <input 
                            type="month" 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)} 
                            className="outline-none text-slate-700 font-medium" 
                        />
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard 
                        icon={<FaMoneyBillWave size={24} className="text-green-500" />} 
                        title="New Commissions" 
                        value={totalNew.toFixed(2)} 
                        colorClass="border-green-500 bg-green-50" 
                    />
                    <StatCard 
                        icon={<FaExchangeAlt size={24} className="text-blue-500" />} 
                        title="Adjustments & Finals" 
                        value={totalSettled.toFixed(2)} 
                        colorClass="border-blue-500 bg-blue-50" 
                    />
                    <StatCard 
                        icon={<FaChartLine size={24} className="text-purple-500" />} 
                        title="Total Payout" 
                        value={(totalNew + totalSettled).toFixed(2)} 
                        colorClass="border-purple-500 bg-purple-50" 
                    />
                </div>

                <CommissionTable 
                    title="New Activity" 
                    subTitle="Initial commissions and Cancellation fees generated this month" 
                    data={data.newBookings} 
                    onEditMonth={handleEditMonth} 
                    onToggleSettled={handleToggleSettled}
                    isSettledTable={false} 
                />

                <CommissionTable 
                    title="Reconciliation & Adjustments" 
                    subTitle="Final profit shares, write-off corrections, and manual adjustments" 
                    data={data.settledBookings} 
                    onEditMonth={handleEditMonth} 
                    onToggleSettled={handleToggleSettled}
                    isSettledTable={true} 
                />
            </div>
        </div>
    );
}