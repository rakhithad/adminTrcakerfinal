import { useState, useEffect } from 'react';
import { FaCalendarAlt, FaMoneyBillWave, FaChartLine, FaUserTie, FaSpinner, FaEdit } from 'react-icons/fa';
import { getAgentCommissions, updateCommissionMonth } from '../api/api';

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

const Badge = ({ type }) => {
    const classes = "px-2.5 py-0.5 rounded-full text-xs font-medium";
    return <span className={`${classes} ${type?.includes('INTERNAL') ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
        {type?.includes('INTERNAL') ? 'Internal' : 'Full'}
    </span>;
};

const CommissionTable = ({ title, data, subTitle, onEditMonth, isSettledTable }) => {
    const totals = data.reduce((acc, row) => ({
        revenue: acc.revenue + parseFloat(row.booking.revenue || 0),
        net: acc.net + parseFloat(row.booking.prodCost || 0),
        initial: acc.initial + parseFloat(row.initialPaid || 0),
        comm: acc.comm + parseFloat(row.amount || 0)
    }), { revenue: 0, net: 0, initial: 0, comm: 0 });

    return (
        <div className="bg-white shadow-lg rounded-xl overflow-hidden mb-8 border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                <p className="text-sm text-slate-500">{subTitle}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Comm. Month</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Folder No</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Agent</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Pax Name</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Method</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Revenue</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Net Cost</th>
                            {isSettledTable && <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Initial Comm</th>}
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                                {isSettledTable ? 'Final Comm' : 'Comm Paid'}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {data.map((row) => (
                            <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap flex items-center gap-2">
                                    {new Date(row.commissionMonth).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                    <button onClick={() => onEditMonth(row)} className="text-slate-300 hover:text-blue-500"><FaEdit size={12}/></button>
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold text-blue-600">{row.booking.folderNo}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.agent?.firstName} {row.agent?.lastName}</td>
                                <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.booking.paxName}</td>
                                <td className="px-4 py-3 whitespace-nowrap"><Badge type={row.booking.paymentMethod}/></td>
                                <td className="px-4 py-3 text-sm text-right">£{parseFloat(row.booking.revenue || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm text-right text-slate-500">£{parseFloat(row.booking.prodCost || 0).toFixed(2)}</td>
                                {isSettledTable && <td className="px-4 py-3 text-sm text-right text-orange-600">£{parseFloat(row.initialPaid || 0).toFixed(2)}</td>}
                                <td className="px-4 py-3 text-sm text-right font-bold text-blue-700 bg-blue-50/30">£{parseFloat(row.amount).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <tr>
                            <td colSpan="5" className="px-4 py-3 text-sm text-slate-800 uppercase text-right">Totals:</td>
                            <td className="px-4 py-3 text-sm text-right">£{totals.revenue.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right">£{totals.net.toFixed(2)}</td>
                            {isSettledTable && <td className="px-4 py-3 text-sm text-right text-orange-600">£{totals.initial.toFixed(2)}</td>}
                            <td className="px-4 py-3 text-sm text-right text-blue-800 bg-blue-100/50">£{totals.comm.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

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
                newBookings: ledger.filter(e => e.type === 'INITIAL'),
                settledBookings: ledger.filter(e => e.type === 'FINAL_RECONCILIATION')
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedMonth]);

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
                <header className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><FaUserTie className="text-blue-600" /> Agent Commissions</h1>
                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border">
                        <FaCalendarAlt className="text-slate-400" />
                        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="outline-none" />
                    </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard icon={<FaMoneyBillWave size={24} className="text-green-500" />} title="New Commission Total" value={totalNew.toFixed(2)} colorClass="border-green-500 bg-green-50" />
                    <StatCard icon={<FaChartLine size={24} className="text-blue-500" />} title="Settled Commission Total" value={totalSettled.toFixed(2)} colorClass="border-blue-500 bg-blue-50" />
                    <StatCard icon={<FaUserTie size={24} className="text-purple-500" />} title="Overall Payout" value={(totalNew + totalSettled).toFixed(2)} colorClass="border-purple-500 bg-purple-50" />
                </div>
                <CommissionTable title="New Bookings" subTitle="Initial commissions (50% or 100%)" data={data.newBookings} onEditMonth={handleEditMonth} isSettledTable={false} />
                <CommissionTable title="Final Payments / Settled Balances" subTitle="Reconciliation of internal bookings" data={data.settledBookings} onEditMonth={handleEditMonth} isSettledTable={true} />
            </div>
        </div>
    );
}