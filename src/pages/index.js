import { SpeedInsights } from "@vercel/speed-insights/next"
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '../lib/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, runTransaction } from 'firebase/firestore';

export default function Home() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const CATEGORY_ORDER = ["Combos", "Burgers", "Pizzas", "Pancakes", "Dips"];
  const [openCategory, setOpenCategory] = useState("Combos");

  // 1. Fetch Menu from Firebase (Real-time)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "menu"), 
      (snapshot) => {
        setMenu(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        setLoading(false);
      },
      (err) => {
        console.error("Snapshot error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Cart Logic
  const addToCart = (item) => {
    setCart([...cart, item]);
  };

  const removeFromCart = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const totalPrice = cart.reduce((sum, item) => sum + Number(item.price ?? 0), 0);

  // 3. Place Order Logic
  const placeOrder = async () => {
    if (cart.length === 0) return alert("Your cart is empty!");
    
    try {
      let orderNumber;
      try {
        const countersRef = doc(db, "system", "counters");
        orderNumber = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(countersRef);
          const current = snap.exists() ? Number(snap.data().orderNumber ?? 0) : 0;
          const next = current + 1;
          transaction.set(countersRef, { orderNumber: next }, { merge: true });
          return next;
        });
      } catch (err) {
        console.warn("Order number transaction failed:", err?.message);
        orderNumber = undefined;
      }
      const itemsForOrder = cart.map((item) => ({
        id: item.id || "",
        name: item.name || "",
        price: Number(item.price ?? 0),
        category: item.category || "Dips",
        vegType: item.vegType || "Veg"
      }));
      const payload = {
        items: itemsForOrder,
        totalPrice: totalPrice,
        status: "pending",
        timestamp: serverTimestamp(),
      };
      if (typeof orderNumber === "number") {
        payload.orderNumber = orderNumber;
      }
      await addDoc(collection(db, "orders"), payload);
      alert(
        typeof orderNumber === "number"
          ? `🍓 Order Placed! Your number: #${orderNumber}. Please proceed to the counter.`
          : "🍓 Order Placed! Please proceed to the counter."
      );
      setCart([]);
    } catch (e) {
      console.error("Order Error: ", e);
      alert("Something went wrong. Try again!");
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-xl font-serif">Loading Elysian Menu...</div>;

  return (
    <div className="min-h-screen bg-pink-50 text-gray-900 pb-24">
      {/* HEADER */}
      <header className="bg-black text-white p-6 text-center shadow-lg sticky top-0 z-10">
        <h1 className="text-3xl font-serif font-bold italic">🍓 ELYSIAN</h1>
        <p className="text-xs uppercase tracking-widest text-pink-400">Café & Activities</p>
      </header>

      <main className="max-w-4xl mx-auto p-4 flex flex-col md:flex-row gap-6">
        
        {/* MENU SECTION */}
        <div className="flex-1">
          <h2 className="text-2xl font-bold mb-6 border-b-2 border-pink-200 pb-2">Our Menu</h2>
          
          {menu.filter(m => m.available !== false).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-pink-100 shadow-sm">
              <p className="text-gray-500 mb-4">No items available in the menu.</p>
              <Link href="/admin" className="text-pink-600 font-bold hover:underline">Go to Admin Dashboard to Seed Menu</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {CATEGORY_ORDER.map((cat) => {
                const items = menu
                  .filter(m => m.available !== false && m.category === cat)
                  .slice()
                  .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
                const isOpen = openCategory === cat;
                return (
                  <div key={cat} className="border border-pink-200 rounded-2xl bg-white">
                    <button
                      onClick={() => setOpenCategory(isOpen ? null : cat)}
                      className="w-full text-left px-4 py-3 font-bold flex justify-between items-center"
                    >
                      <span>{cat}</span>
                      <span className="text-pink-600">{isOpen ? "−" : "+"}</span>
                    </button>
                    <div 
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${ 
                        isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0" 
                      }`}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 pb-4">
                        {items.map((item) => (
                          <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm flex justify-between items-center border border-pink-100">
                            <div className="flex items-center gap-3">
                              {item.imageUrl && (
                                <img 
                                  src={item.imageUrl.trim()} 
                                  alt={item.name} 
                                  className="w-14 h-14 rounded object-cover border" 
                                />
                              )}
                              <div>
                                <h3 className="font-bold text-lg">{item.name}</h3>
                                <p className="text-xs text-gray-500">{item.description}</p>
                                <p className="text-pink-600 font-bold">₹{item.price}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => addToCart(item)}
                              className="bg-black text-white px-4 py-2 rounded-xl font-bold hover:bg-pink-600 transition active:scale-95"
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className="text-sm text-gray-500 px-1">No items in this category</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CART SIDEBAR (Desktop) / FLOATING BUTTON (Mobile) */}
        <div className="w-full md:w-80 bg-white p-6 rounded-3xl shadow-xl border border-pink-200 h-fit sticky top-24">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">Your Tray</h2>
          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">Add something tasty!</p>
          ) : (
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm bg-gray-50 p-2 rounded-lg">
                  <span>{item.name}</span>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold">₹{item.price}</span>
                    <button onClick={() => removeFromCart(idx)} className="text-red-500 font-bold">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="border-t pt-4">
            <div className="flex justify-between text-xl font-bold mb-4">
              <span>Total:</span>
              <span className="text-pink-600">₹{totalPrice}</span>
            </div>
            <button 
              onClick={placeOrder}
              disabled={cart.length === 0}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition shadow-lg ${
                cart.length === 0 ? 'bg-gray-300 text-gray-500' : 'bg-pink-500 text-white hover:bg-pink-600'
              }`}
            >
              Confirm Order
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
