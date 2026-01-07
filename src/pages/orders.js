import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebaseConfig';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/router';

export default function OrdersPage() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const [orders, setOrders] = useState([]);

  // Authentication check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // If not logged in, send them to the login page
        router.push('/login');
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // 1. Listen for Live Orders
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));

    // onSnapshot makes it update automatically without refreshing the page
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const ordersArr = [];
      querySnapshot.forEach((doc) => {
        ordersArr.push({ ...doc.data(), id: doc.id });
      });
      setOrders(ordersArr);
    });

    return () => unsubscribe();
  }, []);

  // 2. Mark order as Completed or Delivered
  const completeOrder = async (orderId) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, { status: "served" });
    } catch (e) {
      alert("Unable to mark as completed. Permission error.");
      console.error(e);
    }
  };

  // 3. Cancel order
  const cancelOrder = async (orderId) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, { status: "cancelled" });
    } catch (e) {
      alert("Unable to cancel order. Permission error.");
      console.error(e);
    }
  };

  // Calculate total orders served
  const totalOrdersServed = orders.filter(order => order.status === 'served').length;
  const totalPendingOrders = orders.filter(order => order.status === 'pending').length;

  // If the user state is empty, show nothing (prevents "flashing" orders content)
  if (!user) return <div className="p-20 text-center">Checking authorization...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="flex items-center justify-between mb-6 max-w-4xl mx-auto">
        <div className="text-lg font-semibold text-gray-700">
          Pending Orders: <span className="text-orange-600 font-bold text-xl">{totalPendingOrders}</span>
        </div>
        <h1 className="text-3xl font-bold">📋 Incoming Orders</h1>
        <div className="text-lg font-semibold text-gray-700">
          Total Served: <span className="text-green-600 font-bold text-xl">{totalOrdersServed}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">
        {orders.length === 0 ? (
          <p className="text-center text-gray-500">No orders yet...</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className={`p-6 rounded-lg shadow-md border-l-8 bg-white ${order.status === 'served' ? 'border-green-500 opacity-60' :
                order.status === 'cancelled' ? 'border-gray-400 opacity-60' :
                  'border-red-500'
              }`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold">Order #{order.orderNumber ?? order.id.slice(0, 5)}</h3>
                  <p className="text-sm text-gray-400">{order.timestamp?.toDate().toLocaleString()}</p>

                  <ul className="mt-3 list-disc list-inside">
                    {Object.values(order.items.reduce((acc, item) => {
                      const key = item.id || item.name;
                      if (!acc[key]) acc[key] = { ...item, quantity: 0 };
                      acc[key].quantity += 1;
                      return acc;
                    }, {})).map((item, idx) => (
                      <li key={idx} className="text-gray-700">
                        {item.name} <span className="font-bold">x{item.quantity}</span> <span className="font-bold">- ₹{item.price * item.quantity}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 font-bold text-xl text-red-600">Total: ₹{order.totalPrice}</p>
                </div>

                <div className="flex flex-col items-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold mb-4 ${order.status === 'served' ? 'bg-green-100 text-green-700' :
                      order.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                        'bg-red-100 text-red-700'
                    }`}>
                    {order.status.toUpperCase()}
                  </span>

                  {order.status !== 'served' && order.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => completeOrder(order.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                      >
                        Mark Done
                      </button>
                      <button
                        onClick={() => { if (confirm('Cancel this order?')) cancelOrder(order.id); }}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
