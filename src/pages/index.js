import { SpeedInsights } from "@vercel/speed-insights/next"
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db } from '../lib/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

export default function Home() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const CATEGORY_ORDER = ["Combos", "Burgers", "Pizzas", "Pancakes", "Dips"];
  const [openCategory, setOpenCategory] = useState("Combos");

  // Auto-expand all categories with search results when searching
  const [expandedCategories, setExpandedCategories] = useState(new Set(["Combos"]));

  useEffect(() => {
    if (searchQuery.trim()) {
      const categoriesWithResults = CATEGORY_ORDER.filter(cat => {
        const items = menuByCategory[cat] || [];
        return items.length > 0;
      });
      // Auto-expand all categories with results
      setExpandedCategories(new Set(categoriesWithResults));
    } else {
      // Reset to default when search is cleared
      setExpandedCategories(new Set(["Combos"]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // 1. Fetch Menu from Firebase (Real-time) with simple local cache
  useEffect(() => {
    // Try to hydrate from localStorage first for faster perceived load
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem("elysian_menu_cache_v1");
        if (cached) {
          const parsed = JSON.parse(cached);
          // Basic TTL check (5 minutes)
          if (parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
            setMenu(parsed.menu || []);
            setLoading(false);
          }
        }
      } catch (e) {
        console.warn("Menu cache read failed", e);
      }
    }

    const unsubscribe = onSnapshot(
      collection(db, "menu"),
      (snapshot) => {
        const freshMenu = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setMenu(freshMenu);
        setLoading(false);

        // Update cache
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              "elysian_menu_cache_v1",
              JSON.stringify({ menu: freshMenu, timestamp: Date.now() })
            );
          } catch (e) {
            console.warn("Menu cache write failed", e);
          }
        }
      },
      (err) => {
        console.error("Snapshot error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Check if orders are being accepted (real-time listener for UI updates)
  useEffect(() => {
    const configRef = doc(db, "system", "config");
    const unsubscribe = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const accepting = snap.data().acceptingOrders;
        // Explicitly check: if field exists and is false, then false; otherwise true
        setAcceptingOrders(accepting !== false && accepting !== undefined);
      } else {
        // Default to accepting orders if config doesn't exist
        setAcceptingOrders(true);
      }
    }, (error) => {
      console.error("Error listening to order acceptance:", error);
      // On error, default to accepting orders
      setAcceptingOrders(true);
    });
    return () => unsubscribe();
  }, []);

  // Memoize items grouped and sorted by category so we don't recompute on every render
  const menuByCategory = useMemo(() => {
    const availableItems = menu.filter((m) => m.available !== false);

    // Filter by search query if present
    const filteredItems = searchQuery.trim()
      ? availableItems.filter(item => {
        const query = searchQuery.toLowerCase();
        const name = (item.name || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        return name.includes(query) || description.includes(query);
      })
      : availableItems;

    const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
      acc[cat] = [];
      return acc;
    }, {});

    for (const item of filteredItems) {
      const cat = item.category || "Dips";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    CATEGORY_ORDER.forEach((cat) => {
      if (grouped[cat]) {
        grouped[cat] = grouped[cat]
          .slice()
          .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      }
    });

    return grouped;
  }, [menu, searchQuery]);

  // 2. Cart Logic
  const addToCart = (item) => {
    setCart([...cart, item]);
  };

  const groupedCart = useMemo(() => {
    const groups = {};
    cart.forEach(item => {
      if (!groups[item.id]) {
        groups[item.id] = { ...item, quantity: 0 };
      }
      groups[item.id].quantity += 1;
    });
    return Object.values(groups);
  }, [cart]);

  const removeFromCart = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const removeFromCartById = (itemId) => {
    const index = cart.findIndex(i => i.id === itemId);
    if (index !== -1) {
      const newCart = [...cart];
      newCart.splice(index, 1);
      setCart(newCart);
    }
  };

  const getItemQty = (itemId) => {
    return cart.filter(i => i.id === itemId).length;
  };

  const totalPrice = cart.reduce((sum, item) => sum + Number(item.price ?? 0), 0);

  // 3. Place Order Logic
  const placeOrder = async () => {
    if (cart.length === 0) return alert("Tray is empty!");

    // Double-check: Read config directly from Firestore before placing order
    try {
      const configRef = doc(db, "system", "config");
      const configSnap = await getDoc(configRef);
      const isAcceptingOrders = configSnap.exists()
        ? configSnap.data().acceptingOrders !== false
        : true; // Default to true if config doesn't exist

      if (!isAcceptingOrders) {
        alert("Sorry, we are not taking any orders at this moment.");
        return;
      }
    } catch (e) {
      console.error("Error checking order acceptance:", e);
      // If we can't check, block the order for safety
      alert("Unable to verify order status. Please try again.");
      return;
    }

    try {
      await addDoc(collection(db, "orders"), {
        items: cart,
        totalPrice: cart.reduce((s, i) => s + i.price, 0),
        status: "pending", // Matches your logic
        timestamp: serverTimestamp(),
      });
      alert("🍓 Order Placed!");
      setCart([]);
    } catch (e) {
      console.error("Firebase Error:", e);
      alert("Permission Denied or Connection Error. Check console.");
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-pink-200 border-t-pink-600 mx-auto mb-4"></div>
          <p className="text-xl font-serif font-bold text-gray-700 animate-pulse">Loading Elysian Menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-gray-900 pb-24 font-inter selection:bg-rose-200">
      {/* HEADER */}
      <header className="bg-[#1a1a1a] text-[#f8f5f2] p-6 text-center shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-90 md:transition-all md:duration-300 border-b border-white/10">
        <h1 className="text-4xl md:text-6xl font-cinzel font-bold tracking-wider transform md:transition-transform md:hover:scale-105 md:duration-300 bg-gradient-to-r from-pink-300 via-rose-200 to-pink-300 bg-clip-text text-transparent drop-shadow-sm">
          ELYSIAN
        </h1>
        <p className="text-xs uppercase tracking-[0.3em] text-rose-300 mt-2 font-inter md:animate-pulse">Premium Food Service</p>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6">
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap');

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(-20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes bounceSlow {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-5px);
            }
          }
          .font-cinzel {
            font-family: 'Cinzel', serif;
          }
          .font-inter {
            font-family: 'Inter', sans-serif;
          }
          .glass-panel {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.5);
          }
          @media (min-width: 768px) {
            .animate-fadeIn {
              animation: fadeIn 0.6s ease-out;
            }
            .animate-slideIn {
              animation: slideIn 0.5s ease-out;
            }
            .animate-bounce-slow {
              animation: bounceSlow 2s infinite;
            }
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(to bottom, #be185d, #a855f7);
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(to bottom, #9d174d, #9333ea);
          }
        `}</style>

        {/* MENU SECTION */}
        <div className="flex-1">
          <div className="mb-6 pb-3 border-b-2 border-pink-200">
            <h2 className="text-4xl md:text-5xl font-cinzel font-bold text-gray-800 mb-2">
              Our Menu
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full mb-6"></div>
            {/* SEARCH BAR */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-4 rounded-full border-0 focus:ring-2 focus:ring-rose-400 bg-white/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:transition-all md:duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] text-gray-800 placeholder-gray-400 font-inter font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors duration-200 text-xl font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50"
                >
                  ×
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-2 text-sm text-gray-600 italic">
                {Object.values(menuByCategory).flat().length} result{Object.values(menuByCategory).flat().length !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {menu.filter(m => m.available !== false).length === 0 ? (
            <div className="text-center py-16 bg-white/80 backdrop-blur-sm rounded-3xl border-2 border-pink-200 shadow-xl transform transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]">
              <div className="text-6xl mb-4">🍽️</div>
              <p className="text-gray-600 mb-4 text-lg">No items available in the menu.</p>
              <Link href="/admin" className="inline-block text-pink-600 font-bold hover:text-pink-700 transition-colors duration-200 underline decoration-2 underline-offset-4">
                Go to Admin Dashboard to Seed Menu
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {CATEGORY_ORDER.map((cat, catIndex) => {
                const items = menuByCategory[cat] || [];
                const isOpen = searchQuery.trim() ? expandedCategories.has(cat) : openCategory === cat;
                if (items.length === 0) return null;

                return (
                  <div
                    key={cat}
                    className="border-0 rounded-3xl bg-white shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:transition-all md:duration-300 overflow-hidden transform md:hover:-translate-y-1"
                    style={{ animationDelay: `${catIndex * 100}ms` }}
                  >
                    <button
                      onClick={() => {
                        if (searchQuery.trim()) {
                          // When searching, toggle individual categories
                          const newExpanded = new Set(expandedCategories);
                          if (newExpanded.has(cat)) {
                            newExpanded.delete(cat);
                          } else {
                            newExpanded.add(cat);
                          }
                          setExpandedCategories(newExpanded);
                        } else {
                          // Normal behavior when not searching
                          setOpenCategory(isOpen ? null : cat);
                        }
                      }}
                      className="w-full text-left px-8 py-6 font-bold flex justify-between items-center bg-white hover:bg-rose-50/50 md:transition-all md:duration-300 group"
                    >
                      <span className="text-xl md:text-3xl font-cinzel text-gray-800 group-hover:text-rose-700 md:transition-all md:duration-300">
                        {cat} {searchQuery.trim() && <span className="text-sm font-inter text-gray-400 font-normal align-middle ml-2">({items.length})</span>}
                      </span>
                      <span className="text-2xl text-pink-600 transform transition-transform duration-300 group-hover:scale-125">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-6 pt-2">
                        {items.map((item, itemIndex) => (
                          <div
                            key={item.id}
                            className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 transform md:transition-all md:duration-300 md:hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] md:hover:-translate-y-1 group"
                            style={{ animationDelay: `${itemIndex * 50}ms` }}
                          >
                            <div className="flex items-start gap-4 flex-1">
                              {item.imageUrl && (
                                <div className="relative overflow-hidden rounded-xl border-2 border-pink-200 group-hover:border-pink-400 transition-colors duration-300">
                                  <img
                                    src={item.imageUrl.trim()}
                                    alt={item.name}
                                    className="w-20 h-20 object-cover transform transition-transform duration-300 group-hover:scale-110"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </div>
                              )}
                              <div className="flex-1">
                                <h3 className="font-bold text-lg md:text-xl font-cinzel text-gray-900 group-hover:text-rose-600 md:transition-colors md:duration-300 mb-1">
                                  {item.name}
                                </h3>
                                <p className="text-xs md:text-sm text-gray-600 mb-2 line-clamp-2">
                                  {item.description}
                                </p>
                                <p className="text-rose-600 font-bold text-lg font-inter">
                                  ₹{item.price}
                                </p>
                              </div>
                            </div>
                            {getItemQty(item.id) === 0 ? (
                              <button
                                onClick={(e) => {
                                  addToCart(item);
                                  // Add a visual feedback
                                  const btn = e.currentTarget;
                                  btn.classList.add('animate-bounce-slow');
                                  setTimeout(() => btn.classList.remove('animate-bounce-slow'), 500);
                                }}
                                className="bg-gray-900 text-white px-6 py-3 rounded-full font-bold hover:bg-rose-600 md:transition-all md:duration-300 active:scale-95 shadow-lg hover:shadow-rose-200 transform whitespace-nowrap flex-shrink-0 tracking-wide"
                              >
                                ADD
                              </button>
                            ) : (
                              <div className="flex items-center gap-3 bg-white border-2 border-rose-100 rounded-full px-2 py-1 shadow-sm md:transition-all md:duration-300">
                                <button
                                  onClick={() => removeFromCartById(item.id)}
                                  className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 active:scale-90 md:transition-all md:duration-200"
                                >
                                  −
                                </button>
                                <span className="font-cinzel font-bold text-lg w-4 text-center text-gray-900">
                                  {getItemQty(item.id)}
                                </span>
                                <button
                                  onClick={() => addToCart(item)}
                                  className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-600 text-white font-bold hover:bg-rose-700 active:scale-90 md:transition-all md:duration-200 shadow-md hover:shadow-rose-200"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CART SIDEBAR (Desktop) / FLOATING BUTTON (Mobile) */}
        <div className="w-full md:w-96 glass-panel p-8 rounded-[2.5rem] shadow-[0_20px_60px_rgb(0,0,0,0.06)] h-fit sticky top-24 transform md:transition-all md:duration-300 hover:shadow-[0_30px_80px_rgb(0,0,0,0.1)] md:animate-slideIn border-0">
          <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-pink-200">
            <h2 className="text-3xl font-cinzel font-bold text-gray-900">
              Your Tray
            </h2>
            {cart.length > 0 && (
              <span className="bg-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full animate-bounce-slow">
                {cart.length}
              </span>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3 animate-bounce-slow">🛒</div>
              <p className="text-gray-400 text-sm font-medium">Add something tasty!</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {groupedCart.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center text-sm bg-gradient-to-r from-pink-50 to-purple-50 p-3 rounded-xl border border-pink-200/50 transform transition-all duration-300 hover:scale-[1.02] hover:shadow-md animate-fadeIn"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <span className="font-medium text-gray-800 flex-1 truncate pr-2 font-inter">
                    {item.name} <span className="text-rose-600 font-bold text-xs ml-1">x {item.quantity}</span>
                  </span>
                  <div className="flex gap-3 items-center flex-shrink-0">
                    <span className="font-bold text-pink-600">₹{item.price * item.quantity}</span>
                    <button
                      onClick={() => removeFromCartById(item.id)}
                      className="text-red-500 font-bold text-xl hover:text-red-700 hover:scale-125 transition-all duration-200 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t-2 border-pink-200/50 pt-4 mt-4">
            <div className="flex justify-between items-center text-2xl font-bold mb-4 bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              <span>Total:</span>
              <span className="text-pink-600 transform transition-transform duration-300 hover:scale-110">
                ₹{totalPrice}
              </span>
            </div>
            {!acceptingOrders && (
              <div className="mb-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl transform transition-all duration-300 animate-pulse">
                <p className="text-red-700 text-sm font-semibold text-center flex items-center justify-center gap-2">
                  <span>⚠️</span>
                  <span>Sorry, we are not taking any orders at this moment.</span>
                </p>
              </div>
            )}
            <button
              onClick={placeOrder}
              disabled={cart.length === 0 || !acceptingOrders}
              className={`w-full py-4 rounded-2xl font-bold text-lg md:transition-all md:duration-300 shadow-xl transform font-inter tracking-wide ${cart.length === 0 || !acceptingOrders
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-rose-600 to-pink-600 text-white hover:from-rose-700 hover:to-pink-700 md:hover:scale-[1.02] active:scale-95 hover:shadow-2xl hover:shadow-rose-200'
                }`}
            >
              {cart.length === 0 ? 'Add Items to Order' : 'Confirm Order 🍓'}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
