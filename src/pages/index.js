import { SpeedInsights } from "@vercel/speed-insights/next"
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db } from '../lib/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc, query, where, documentId } from 'firebase/firestore';
import { X, Clock, CheckCircle } from 'lucide-react';

export default function Home() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const CATEGORY_ORDER = ["Combos", "Burgers", "Pizzas", "Pancakes", "Dips"];
  const [openCategory, setOpenCategory] = useState("Combos");
  const [myOrderIds, setMyOrderIds] = useState([]);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

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

  // Load My Orders from LocalStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("elysian_my_orders");
      if (saved) {
        setMyOrderIds(JSON.parse(saved));
      }
    }
  }, []);

  // Listen to My Orders updates
  useEffect(() => {
    if (myOrderIds.length === 0) return;

    // Firestore limitation: 'in' queries support max 10 values.
    // We'll take the last 10 orders.
    const recentIds = myOrderIds.slice(-10);

    const q = query(
      collection(db, "orders"),
      where(documentId(), "in", recentIds)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      // Sort by timestamp desc manually since we can't easily order by timestamp with 'in' query on ID
      orders.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setTrackedOrders(orders);
    });

    return () => unsubscribe();
  }, [myOrderIds]);

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

  const placeOrderWithMode = async (mode) => {
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
      const total = cart.reduce((s, i) => s + i.price, 0);
      const docRef = await addDoc(collection(db, "orders"), {
        items: cart,
        totalPrice: total,
        status: "pending",
        paymentStatus: mode === "UPI" ? "awaiting_verification" : "cash",
        timestamp: serverTimestamp(),
      });

      // Save to local tracked orders
      const newOrderIds = [...myOrderIds, docRef.id];
      setMyOrderIds(newOrderIds);
      localStorage.setItem("elysian_my_orders", JSON.stringify(newOrderIds));

      if (mode === "UPI") {
        const myUpiId = process.env.NEXT_PUBLIC_UPI_ID || "vishhh@slc";
        const businessName = "Ivory Café";
        const upiUrl = `upi://pay?pa=${encodeURIComponent(myUpiId)}&pn=${encodeURIComponent(businessName)}&am=${encodeURIComponent(total)}&cu=INR&tn=${encodeURIComponent("Order " + docRef.id)}&tr=${encodeURIComponent(docRef.id)}`;
        alert(`Redirecting to payment for ₹${total}... Please complete payment and return to this page.`);
        if (typeof window !== "undefined") {
          window.location.href = upiUrl;
        }
      } else {
        alert("Order placed. Please pay cash at the counter.");
      }

      alert("🍓 Order Placed! You can track it in 'My Orders'.");
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
      <header className="bg-[#1a1a1a] text-[#f8f5f2] py-4 px-6 md:p-6 text-center shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-90 md:transition-all md:duration-300 border-b border-white/10 flex justify-between md:justify-center items-center relative">
        {/* Placeholder to balance center alignment on desktop if needed, or just absolute centering */}

        {/* Center Content: Title */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-6xl font-cinzel font-bold tracking-wider transform md:transition-transform md:hover:scale-105 md:duration-300 bg-gradient-to-r from-pink-300 via-rose-200 to-pink-300 bg-clip-text text-transparent drop-shadow-sm">
            Ivory Café
          </h1>
          <p className="text-[0.65rem] md:text-xs uppercase tracking-[0.3em] text-rose-300 mt-1 md:mt-2 font-inter md:animate-pulse">Premium Food Service</p>
        </div>

        {/* My Orders Button - Absolute on Desktop, Relative/Flex on Mobile if needed, but Absolute is cleaner for centered title */}
        <button
          onClick={() => setShowOrderHistory(true)}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 md:right-8 md:top-1/2 md:-translate-y-1/2 text-rose-300 hover:text-white transition-all active:scale-95"
          aria-label="My Orders"
        >
          {/* Desktop Version */}
          <div className="hidden md:flex items-center gap-2 border border-rose-300/30 px-4 py-2 rounded-full hover:bg-rose-900/40 transition-all ml-4">
            <span className="text-sm font-bold font-inter">My Orders</span>
            {trackedOrders.filter(o => o.status === 'pending').length > 0 && (
              <span className="bg-rose-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse shadow-glow">
                {trackedOrders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </div>

          {/* Mobile Version: Icon Only */}
          <div className="md:hidden relative p-2 bg-white/5 rounded-full backdrop-blur-sm border border-white/10">
            <Clock className="w-5 h-5" />
            {trackedOrders.filter(o => o.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-pulse border border-[#1a1a1a]">
                {trackedOrders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </div>
        </button>
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
              onClick={() => setShowPaymentModal(true)}
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

        {/* Order History Modal */}
        {showOrderHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-rose-50/50">
                <h3 className="font-cinzel font-bold text-2xl text-gray-900">My Orders</h3>
                <button
                  onClick={() => setShowOrderHistory(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {trackedOrders.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-4xl mb-2">🥥</p>
                    <p>No recent orders found.</p>
                  </div>
                ) : (
                  trackedOrders.map(order => (
                    <div key={order.id} className="border border-gray-100 rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] bg-white">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            {order.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                          </p>
                          <p className="font-bold text-gray-800 text-lg">
                            ₹{order.totalPrice}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${order.status === 'served' ? 'bg-green-100 text-green-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700 animate-pulse'
                          }`}>
                          {order.status}
                        </span>
                      </div>

                      <div className="space-y-1 mb-3">
                        {order.items.slice(0, 3).map((item, i) => (
                          <p key={i} className="text-sm text-gray-600 truncate">
                            {item.quantity ? `${item.quantity}x ` : ''}{item.name}
                          </p>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-xs text-rose-500 font-medium italic">
                            + {order.items.length - 3} more items...
                          </p>
                        )}
                      </div>

                      {order.status === 'pending' && (
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
                          <div className="bg-rose-500 h-1.5 rounded-full w-2/3 animate-[shimmer_1.5s_infinite_linear] bg-[length:400%_100%] bg-gradient-to-r from-rose-500 via-rose-300 to-rose-500"></div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {showPaymentModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-rose-50/50">
                <h3 className="font-cinzel font-bold text-2xl text-gray-900">Select Payment Mode</h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <button
                  onClick={() => { setShowPaymentModal(false); placeOrderWithMode("UPI"); }}
                  disabled={cart.length === 0 || !acceptingOrders}
                  className={`w-full py-4 rounded-2xl font-bold text-lg ${cart.length === 0 || !acceptingOrders ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-rose-600 to-pink-600 text-white hover:from-rose-700 hover:to-pink-700'}`}
                >
                  UPI
                </button>
                <button
                  onClick={() => { setShowPaymentModal(false); placeOrderWithMode("Cash"); }}
                  disabled={cart.length === 0 || !acceptingOrders}
                  className={`w-full py-4 rounded-2xl font-bold text-lg ${cart.length === 0 || !acceptingOrders ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-rose-600'}`}
                >
                  Cash
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
