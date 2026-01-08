import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const CategoryTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
        <p className="font-bold text-gray-900">{data.name}</p>
        <p className="text-green-600">Revenue: ₹{data.value.toLocaleString()}</p>
        <p className="text-blue-600">Items Sold: {data.count}</p>
      </div>
    );
  }
  return null;
};

export default function StatsPage() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState("all"); // all, today, week, month

  // Authentication check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Fetch all orders in real-time
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const ordersArr = [];
      querySnapshot.forEach((doc) => {
        ordersArr.push({ ...doc.data(), id: doc.id });
      });
      setOrders(ordersArr);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Filter orders by time period
  const filteredOrders = useMemo(() => {
    const servedOrders = orders.filter(order => order.status === 'served');
    const now = new Date();
    let cutoffDate = new Date(0); // Beginning of time

    if (timePeriod === 'today') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timePeriod === 'week') {
      cutoffDate = new Date(now);
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timePeriod === 'month') {
      cutoffDate = new Date(now);
      cutoffDate.setMonth(now.getMonth() - 1);
    }

    return servedOrders.filter(order => {
      if (!order.timestamp) return false;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      return orderDate >= cutoffDate;
    });
  }, [orders, timePeriod]);

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    const totalProfit = filteredOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);
    const totalOrdersServed = filteredOrders.length;
    const averageOrderValue = totalOrdersServed > 0 ? totalProfit / totalOrdersServed : 0;

    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = filteredOrders.filter(order => {
      if (!order.timestamp) return false;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      return orderDate >= today;
    });
    const todayRevenue = todayOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);

    // This week's stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekOrders = filteredOrders.filter(order => {
      if (!order.timestamp) return false;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      return orderDate >= weekAgo;
    });
    const weekRevenue = weekOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);

    // This month's stats
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthOrders = filteredOrders.filter(order => {
      if (!order.timestamp) return false;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      return orderDate >= monthAgo;
    });
    const monthRevenue = monthOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);

    // Highest order value
    const highestOrder = filteredOrders.length > 0
      ? Math.max(...filteredOrders.map(o => Number(o.totalPrice) || 0))
      : 0;

    return {
      totalProfit,
      totalOrdersServed,
      averageOrderValue,
      todayRevenue,
      todayOrders: todayOrders.length,
      weekRevenue,
      weekOrders: weekOrders.length,
      monthRevenue,
      monthOrders: monthOrders.length,
      highestOrder
    };
  }, [filteredOrders]);

  // Prepare data for revenue over time chart (last 7 days)
  const revenueOverTimeData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayRevenue = filteredOrders
        .filter(order => {
          if (!order.timestamp) return false;
          const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
          return orderDate >= date && orderDate < nextDay;
        })
        .reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);

      days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: dayRevenue,
        orders: filteredOrders.filter(order => {
          if (!order.timestamp) return false;
          const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
          return orderDate >= date && orderDate < nextDay;
        }).length
      });
    }
    return days;
  }, [filteredOrders]);

  // Prepare data for revenue by category
  const revenueByCategoryData = useMemo(() => {
    const categoryMap = {};
    filteredOrders.forEach(order => {
      order.items?.forEach(item => {
        const cat = item.category || 'Other';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { revenue: 0, count: 0 };
        }
        categoryMap[cat].revenue += (Number(item.price) || 0);
        categoryMap[cat].count += 1;
      });
    });
    return Object.entries(categoryMap).map(([name, data]) => ({
      name,
      value: data.revenue,
      count: data.count
    }));
  }, [filteredOrders]);

  // Prepare data for hourly revenue (today)
  const hourlyRevenueData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, orders: 0 }));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filteredOrders
      .filter(order => {
        if (!order.timestamp) return false;
        const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
        return orderDate >= today;
      })
      .forEach(order => {
        const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
        const hour = orderDate.getHours();
        hours[hour].revenue += Number(order.totalPrice) || 0;
        hours[hour].orders += 1;
      });

    return hours.map(h => ({
      hour: `${h.hour}:00`,
      revenue: h.revenue,
      orders: h.orders
    }));
  }, [filteredOrders]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  // Best selling items analysis
  const bestSellingItems = useMemo(() => {
    const itemMap = {};
    filteredOrders.forEach(order => {
      order.items?.forEach(item => {
        const itemName = item.name || 'Unknown';
        if (!itemMap[itemName]) {
          itemMap[itemName] = { name: itemName, quantity: 0, revenue: 0, category: item.category || 'Other' };
        }
        itemMap[itemName].quantity += 1;
        itemMap[itemName].revenue += (Number(item.price) || 0);
      });
    });
    return Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [filteredOrders]);

  // Day of week analysis
  const dayOfWeekData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayMap = days.reduce((acc, day) => {
      acc[day] = { day, revenue: 0, orders: 0 };
      return acc;
    }, {});

    filteredOrders.forEach(order => {
      if (!order.timestamp) return;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      const dayName = days[orderDate.getDay()];
      dayMap[dayName].revenue += Number(order.totalPrice) || 0;
      dayMap[dayName].orders += 1;
    });

    return Object.values(dayMap);
  }, [filteredOrders]);

  // Peak hours analysis (all time)
  const peakHoursData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, orders: 0 }));

    filteredOrders.forEach(order => {
      if (!order.timestamp) return;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      const hour = orderDate.getHours();
      hours[hour].revenue += Number(order.totalPrice) || 0;
      hours[hour].orders += 1;
    });

    return hours.map(h => ({
      hour: `${h.hour}:00`,
      revenue: h.revenue,
      orders: h.orders
    }));
  }, [filteredOrders]);

  // Order status breakdown
  const orderStatusData = useMemo(() => {
    const statusMap = { served: 0, pending: 0, cancelled: 0 };
    orders.forEach(order => {
      const status = order.status || 'pending';
      statusMap[status] = (statusMap[status] || 0) + 1;
    });
    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [orders]);

  // Payment Method Breakdown
  const paymentMethodData = useMemo(() => {
    const paymentMap = { Cash: 0, UPI: 0 };
    orders.forEach(order => {
      // Map 'awaiting_verification' to 'UPI', 'cash' to 'Cash'
      // Handle other potential statuses if any, default to checking content
      let mode = 'Other';
      const status = (order.paymentStatus || '').toLowerCase();

      if (status.includes('cash')) {
        mode = 'Cash';
      } else if (status.includes('upi') || status === 'awaiting_verification') {
        mode = 'UPI';
      } else {
        // Fallback or count matches
        if (status === 'paid') mode = 'UPI'; // Assumption based on typical flow
        else mode = 'UPI'; // Defaulting to UPI if unknown logic implies digital? Or maybe 'Other'
      }

      // Stronger check:
      if (status === 'cash') mode = 'Cash';
      else mode = 'UPI'; // Treat everything else as UPI/Digital for now

      paymentMap[mode] = (paymentMap[mode] || 0) + 1;
    });
    return Object.entries(paymentMap).map(([name, value]) => ({ name, value }));
  }, [orders]);

  // Average items per order
  const avgItemsPerOrder = useMemo(() => {
    if (filteredOrders.length === 0) return 0;
    const totalItems = filteredOrders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    return (totalItems / filteredOrders.length).toFixed(2);
  }, [filteredOrders]);

  // Time period comparison (growth metrics)
  const growthMetrics = useMemo(() => {
    const now = new Date();
    const currentPeriod = filteredOrders;

    // Previous period based on timePeriod
    let prevStart, prevEnd, currentStart;
    if (timePeriod === 'today') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(currentStart);
    } else if (timePeriod === 'week') {
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 7);
      prevEnd = new Date(currentStart);
    } else if (timePeriod === 'month') {
      currentStart = new Date(now);
      currentStart.setMonth(currentStart.getMonth() - 1);
      prevStart = new Date(currentStart);
      prevStart.setMonth(prevStart.getMonth() - 1);
      prevEnd = new Date(currentStart);
    } else {
      return { revenueGrowth: 0, ordersGrowth: 0 };
    }

    const prevPeriod = orders
      .filter(order => order.status === 'served' && order.timestamp)
      .filter(order => {
        const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
        return orderDate >= prevStart && orderDate < prevEnd;
      });

    const currentRevenue = currentPeriod.reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);
    const prevRevenue = prevPeriod.reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);
    const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : 0;

    const ordersGrowth = prevPeriod.length > 0
      ? ((currentPeriod.length - prevPeriod.length) / prevPeriod.length * 100).toFixed(1)
      : 0;

    return { revenueGrowth, ordersGrowth };
  }, [filteredOrders, orders, timePeriod]);

  // Time of day analysis (Morning: 6-12, Afternoon: 12-18, Evening: 18-24, Night: 0-6)
  const timeOfDayData = useMemo(() => {
    const periods = {
      'Night (12AM-6AM)': { revenue: 0, orders: 0 },
      'Morning (6AM-12PM)': { revenue: 0, orders: 0 },
      'Afternoon (12PM-6PM)': { revenue: 0, orders: 0 },
      'Evening (6PM-12AM)': { revenue: 0, orders: 0 }
    };

    filteredOrders.forEach(order => {
      if (!order.timestamp) return;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      const hour = orderDate.getHours();
      let period;
      if (hour >= 0 && hour < 6) period = 'Night (12AM-6AM)';
      else if (hour >= 6 && hour < 12) period = 'Morning (6AM-12PM)';
      else if (hour >= 12 && hour < 18) period = 'Afternoon (12PM-6PM)';
      else period = 'Evening (6PM-12AM)';

      periods[period].revenue += Number(order.totalPrice) || 0;
      periods[period].orders += 1;
    });

    return Object.entries(periods).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      orders: data.orders
    }));
  }, [filteredOrders]);

  // Basic stats for header
  const basicStats = {
    totalOrders: orders.length,
    totalRevenue: orders
      .filter(order => order.status === 'served')
      .reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0),
    pendingOrders: orders.filter(order => order.status === 'pending').length,
    completedOrders: orders.filter(order => order.status === 'served').length,
    cancelledOrders: orders.filter(order => order.status === 'cancelled').length,
  };

  if (!user) return <div className="p-20 text-center">Checking authorization...</div>;

  if (loading) return <div className="p-20 text-center">Loading statistics...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">📊 Order Statistics</h1>
          <Link
            href="/admin"
            className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 transition"
          >
            ← Back to Admin
          </Link>
        </div>

        {/* Basic Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500">
            <div className="text-sm text-gray-600 mb-2">Total Orders</div>
            <div className="text-3xl font-bold text-gray-900">{basicStats.totalOrders}</div>
            <div className="text-xs text-gray-500 mt-1">All time</div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
            <div className="text-sm text-gray-600 mb-2">Total Revenue</div>
            <div className="text-3xl font-bold text-green-600">₹{basicStats.totalRevenue.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">From completed orders</div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-orange-500">
            <div className="text-sm text-gray-600 mb-2">Pending Orders</div>
            <div className="text-3xl font-bold text-orange-600">{basicStats.pendingOrders}</div>
            <div className="text-xs text-gray-500 mt-1">Awaiting completion</div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-600">
            <div className="text-sm text-gray-600 mb-2">Completed Orders</div>
            <div className="text-3xl font-bold text-green-600">{basicStats.completedOrders}</div>
            <div className="text-xs text-gray-500 mt-1">Successfully served</div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-red-500">
            <div className="text-sm text-gray-600 mb-2">Cancelled Orders</div>
            <div className="text-3xl font-bold text-red-600">{basicStats.cancelledOrders}</div>
            <div className="text-xs text-gray-500 mt-1">Cancelled</div>
          </div>
        </div>

        {/* Time Period Selector */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTimePeriod('all')}
            className={`px-4 py-2 rounded font-semibold transition ${timePeriod === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
              }`}
          >
            All Time
          </button>
          <button
            onClick={() => setTimePeriod('month')}
            className={`px-4 py-2 rounded font-semibold transition ${timePeriod === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
              }`}
          >
            This Month
          </button>
          <button
            onClick={() => setTimePeriod('week')}
            className={`px-4 py-2 rounded font-semibold transition ${timePeriod === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
              }`}
          >
            This Week
          </button>
          <button
            onClick={() => setTimePeriod('today')}
            className={`px-4 py-2 rounded font-semibold transition ${timePeriod === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
              }`}
          >
            Today
          </button>
        </div>

        {/* Key Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
            <div className="text-sm font-semibold opacity-90 mb-2">Total Revenue</div>
            <div className="text-3xl font-bold">₹{stats.totalProfit.toLocaleString()}</div>
            <div className="text-xs mt-2 opacity-80">{stats.totalOrdersServed} orders</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
            <div className="text-sm font-semibold opacity-90 mb-2">Average Order Value</div>
            <div className="text-3xl font-bold">₹{Math.round(stats.averageOrderValue).toLocaleString()}</div>
            <div className="text-xs mt-2 opacity-80">Per order</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
            <div className="text-sm font-semibold opacity-90 mb-2">Today's Revenue</div>
            <div className="text-3xl font-bold">₹{stats.todayRevenue.toLocaleString()}</div>
            <div className="text-xs mt-2 opacity-80">{stats.todayOrders} orders today</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
            <div className="text-sm font-semibold opacity-90 mb-2">Highest Order</div>
            <div className="text-3xl font-bold">₹{stats.highestOrder.toLocaleString()}</div>
            <div className="text-xs mt-2 opacity-80">Single order value</div>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">This Week</div>
            <div className="text-2xl font-bold text-gray-900">₹{stats.weekRevenue.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{stats.weekOrders} orders</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">This Month</div>
            <div className="text-2xl font-bold text-gray-900">₹{stats.monthRevenue.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{stats.monthOrders} orders</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">Total Orders Served</div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalOrdersServed}</div>
            <div className="text-xs text-gray-500 mt-1">Completed orders</div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue Over Time (Last 7 Days) */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Revenue Over Time (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueOverTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue (₹)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Orders Over Time (Last 7 Days) */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Orders Over Time (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueOverTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Category */}
        {revenueByCategoryData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-lg border">
              <h3 className="text-xl font-bold mb-4">Revenue by Category</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueByCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {revenueByCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-lg border">
              <h3 className="text-xl font-bold mb-4">Revenue by Category (Bar)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueByCategoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CategoryTooltip />} />
                  <Legend />
                  <Bar dataKey="value" fill="#10b981" name="Revenue (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Hourly Revenue (Today) */}
        {timePeriod === 'today' && (
          <div className="bg-white p-6 rounded-xl shadow-lg border mb-8">
            <h3 className="text-xl font-bold mb-4">Hourly Revenue (Today)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Additional Statistics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Day of Week Analysis */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Revenue by Day of Week</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dayOfWeekData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Peak Hours Analysis */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Peak Hours Analysis</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={peakHoursData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Revenue (₹)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Time of Day Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Revenue by Time of Day</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timeOfDayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#f59e0b" name="Revenue (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Order Status Breakdown */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Order Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={
                      entry.name === 'served' ? '#10b981' :
                        entry.name === 'pending' ? '#f59e0b' :
                          '#ef4444'
                    } />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Payment Method Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentMethodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={
                      entry.name === 'Cash' ? '#10b981' : '#3b82f6'
                    } />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Growth Metrics & Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">Revenue Growth</div>
            <div className={`text-3xl font-bold ${Number(growthMetrics.revenueGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(growthMetrics.revenueGrowth) >= 0 ? '+' : ''}{growthMetrics.revenueGrowth}%
            </div>
            <div className="text-xs text-gray-500 mt-1">vs previous period</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">Orders Growth</div>
            <div className={`text-3xl font-bold ${Number(growthMetrics.ordersGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(growthMetrics.ordersGrowth) >= 0 ? '+' : ''}{growthMetrics.ordersGrowth}%
            </div>
            <div className="text-xs text-gray-500 mt-1">vs previous period</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <div className="text-sm text-gray-600 mb-2">Avg Items per Order</div>
            <div className="text-3xl font-bold text-gray-900">{avgItemsPerOrder}</div>
            <div className="text-xs text-gray-500 mt-1">Items per order</div>
          </div>
        </div>

        {/* Best Selling Items */}
        <div className="bg-white p-6 rounded-xl shadow-lg border mb-8">
          <h3 className="text-xl font-bold mb-4">Top 10 Best Selling Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Rank</th>
                  <th className="text-left p-3">Item Name</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Quantity Sold</th>
                  <th className="text-right p-3">Total Revenue</th>
                  <th className="text-right p-3">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {bestSellingItems.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-bold">#{index + 1}</td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">{item.category}</span>
                    </td>
                    <td className="p-3 text-right font-semibold">{item.quantity}</td>
                    <td className="p-3 text-right font-semibold text-green-600">₹{item.revenue.toLocaleString()}</td>
                    <td className="p-3 text-right text-gray-600">₹{Math.round(item.revenue / item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
                {bestSellingItems.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-gray-500">No items sold yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
