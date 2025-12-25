import React, { useState } from 'react';
import { FaCalendarAlt, FaSearch, FaDownload, FaMoneyBillWave, FaChartLine, FaUserTie } from 'react-icons/fa';

// --- Helper Components ---

const StatCard = ({ icon, title, value, colorClass }) => (
    <div className={`flex items-center p-4 bg-white shadow-lg rounded-xl border-l-4 ${colorClass}`}>
        <div className={`p-3 rounded-full bg-opacity-20 ${colorClass.replace('border-', 'bg-').replace('500', '100')}`}>
            {icon}
        </div>
        <div className="ml-4">
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);

const Badge = ({ type }) => {
    let classes = "px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (type) {
        case 'Internal': return `${classes} bg-purple-100 text-purple-800`;
        case 'External': return `${classes} bg-blue-100 text-blue-800`;
        case 'Flight': return `${classes} bg-sky-100 text-sky-800`;
        case 'Package': return `${classes} bg-teal-100 text-teal-800`;
        case 'Hotel': return `${classes} bg-orange-100 text-orange-800`;
        default: return `${classes} bg-gray-100 text-gray-800`;
    }
};

// --- Reusable Table Component to ensure identical layout ---
const CommissionTable = ({ title, data, subTitle }) => (
    <div className="bg-white shadow-lg rounded-xl overflow-hidden mb-8 border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
                <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                <p className="text-sm text-slate-500">{subTitle}</p>
            </div>
            <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-1 rounded">
                {data.length} Records
            </span>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">PC Date</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Pax Country</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Folder No</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Ref No</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Pax Name</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Booking Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Payment Method</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Net Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Gross Profit</th>
                        <th className="px-4 py-3 text-right text-xs font-extrabold text-blue-700 uppercase tracking-wider bg-blue-50/50">Commission</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {data.map((row, index) => (
                        <tr key={index} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{row.pcDate}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{row.paxCountry}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-blue-600 whitespace-nowrap cursor-pointer hover:underline">{row.folderNo}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{row.refNo}</td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{row.paxName}</td>
                            <td className="px-4 py-3 whitespace-nowrap"><Badge type={row.bookingType}>{row.bookingType}</Badge></td>
                            <td className="px-4 py-3 whitespace-nowrap"><Badge type={row.paymentMethod}>{row.paymentMethod}</Badge></td>
                            
                            <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">£{row.revenue.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right text-slate-500">£{row.net.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-green-600">£{row.profit.toFixed(2)}</td>
                            
                            {/* Commission Column - Highlighted */}
                            <td className="px-4 py-3 text-sm text-right font-bold text-blue-700 bg-blue-50/30 border-l border-blue-100">
                                £{row.commissionProfit.toFixed(2)}
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr>
                            <td colSpan="11" className="px-4 py-8 text-center text-slate-500 italic">No records found for this period.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

export default function AgentCommissions() {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    
    // MOCK DATA - Table 1: New Bookings
    const newBookingsData = [
        { pcDate: '2024-03-15', paxCountry: 'UK', folderNo: '100245', refNo: 'REF-001', paxName: 'John Doe', bookingType: 'Package', paymentMethod: 'Internal', revenue: 2500.00, net: 2000.00, profit: 500.00, commissionProfit: 250.00 },
        { pcDate: '2024-03-18', paxCountry: 'USA', folderNo: '100248', refNo: 'REF-003', paxName: 'Sarah Smith', bookingType: 'Flight', paymentMethod: 'External', revenue: 1200.00, net: 1000.00, profit: 200.00, commissionProfit: 200.00 },
        { pcDate: '2024-03-20', paxCountry: 'UAE', folderNo: '100250', refNo: 'REF-009', paxName: 'Ahmed Al-Fayed', bookingType: 'Hotel', paymentMethod: 'External', revenue: 800.00, net: 650.00, profit: 150.00, commissionProfit: 150.00 },
    ];

    // MOCK DATA - Table 2: Final Payments (Recent Months)
    const finalPaymentsData = [
        { pcDate: '2024-01-10', paxCountry: 'UK', folderNo: '100190', refNo: 'REF-882', paxName: 'Emma Watson', bookingType: 'Package', paymentMethod: 'Internal', revenue: 3000.00, net: 2400.00, profit: 600.00, commissionProfit: 300.00 },
        { pcDate: '2024-02-05', paxCountry: 'AUS', folderNo: '100210', refNo: 'REF-991', paxName: 'Liam Hemsworth', bookingType: 'Package', paymentMethod: 'External', revenue: 4500.00, net: 3500.00, profit: 1000.00, commissionProfit: 1000.00 },
    ];

    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1600px] mx-auto">
                
                {/* --- Header Section --- */}
                <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <FaUserTie className="text-blue-600" /> Agent Commissions
                        </h1>
                        <p className="text-slate-500 mt-1">Track monthly commissions for new bookings and settled balances.</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                        <FaCalendarAlt className="text-slate-400 ml-2" />
                        <span className="text-sm font-semibold text-slate-700">Period:</span>
                        <input 
                            type="month" 
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="outline-none text-slate-800 font-medium cursor-pointer"
                        />
                    </div>
                </header>

                {/* --- Stats Cards --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard 
                        icon={<FaMoneyBillWave size={24} className="text-green-500" />} 
                        title="Total New Commission" 
                        value="£600.00" 
                        colorClass="border-green-500 bg-green-50" 
                    />
                    <StatCard 
                        icon={<FaChartLine size={24} className="text-blue-500" />} 
                        title="Total Final Payment Comm." 
                        value="£1,300.00" 
                        colorClass="border-blue-500 bg-blue-50" 
                    />
                    <div className="flex items-center justify-center p-4 bg-white shadow-lg rounded-xl border border-slate-200">
                        <button className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-semibold shadow-md">
                            <FaDownload /> Export Report
                        </button>
                    </div>
                </div>

                {/* --- Table 1: New Bookings --- */}
                <CommissionTable 
                    title="New Bookings" 
                    subTitle={`New business confirmed in ${new Date(selectedMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
                    data={newBookingsData} 
                />

                {/* --- Table 2: Final Payments --- */}
                <CommissionTable 
                    title="Final Payments / Settled Balances" 
                    subTitle="Commissions released upon final payment receipt from recent months"
                    data={finalPaymentsData} 
                />

            </div>
        </div>
    );
}