import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebaseConfig';
import { collection, updateDoc, doc, addDoc, deleteDoc, writeBatch, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/router';

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const categories = ["Dips", "Pancakes", "Burgers", "Pizzas", "Combos", "Cheesecakes", "Specials"];
  const CATEGORY_ORDER = ["Specials", "Combos", "Burgers", "Pizzas", "Pancakes", "Cheesecakes", "Dips"]; // Same order as main page
  const [menu, setMenu] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [openCategory, setOpenCategory] = useState("Combos"); // Default open category
  const [newItem, setNewItem] = useState({
    name: "",
    price: "",
    category: "Dips",
    vegType: "Veg",
    available: true,
    description: "",
    imageUrl: ""
  });

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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "menu"), (snapshot) => {
      setMenu(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return () => unsubscribe();
  }, []);


  // Fetch and listen to order acceptance state
  useEffect(() => {
    if (!user) return;

    const configRef = doc(db, "system", "config");

    // Initial fetch
    getDoc(configRef).then((snap) => {
      if (snap.exists()) {
        setAcceptingOrders(snap.data().acceptingOrders !== false);
      } else {
        // Initialize if doesn't exist
        setDoc(configRef, { acceptingOrders: true });
      }
    });

    // Real-time listener
    const unsubscribe = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        setAcceptingOrders(snap.data().acceptingOrders !== false);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Toggle order acceptance
  const toggleAcceptOrders = async () => {
    try {
      const configRef = doc(db, "system", "config");
      await setDoc(configRef, { acceptingOrders: !acceptingOrders }, { merge: true });
    } catch (e) {
      console.error("Error updating order acceptance:", e);
      alert("Failed to update order acceptance status");
    }
  };

  const seedItems = async () => {
    const fullMenu = [
      { name: "Strawberry Dip", price: 79, category: "Dips", vegType: "Veg", available: true, description: "Fresh strawberries paired with a rich chocolate dip." },
      { name: "Strawberry Thangulu", price: 69, category: "Dips", vegType: "Veg", available: true, description: "Crunchy candied strawberries on a stick." },
      { name: "Marshmallow Dip", price: 89, category: "Dips", vegType: "Veg", available: true, description: "Fluffy marshmallows with a side of warm chocolate sauce." },
      { name: "Marshmallow Toasted (5pcs)", price: 79, category: "Dips", vegType: "Veg", available: true, description: "Perfectly toasted golden-brown marshmallows." },
      { name: "Biscuit Marshmallow (5pcs)", price: 69, category: "Dips", vegType: "Veg", available: true, description: "Marshmallows sandwiched between crispy biscuits." },
      { name: "Pancakes (Plain)", price: 39, category: "Pancakes", vegType: "Veg", available: true, description: "Fluffy, golden pancakes served with butter." },
      { name: "Pancakes + Honey", price: 49, category: "Pancakes", vegType: "Veg", available: true, description: "Classic pancakes drizzled with pure honey." },
      { name: "Pancakes + Honey & Fruits", price: 59, category: "Pancakes", vegType: "Veg", available: true, description: "Pancakes topped with honey and fresh seasonal fruits." },
      { name: "Pancakes + Nutella", price: 79, category: "Pancakes", vegType: "Veg", available: true, description: "Indulgent pancakes smothered in Nutella." },
      { name: "Veg Burger", price: 79, category: "Burgers", vegType: "Veg", available: true, description: "Classic vegetable patty burger with fresh lettuce and mayo." },
      { name: "Burger Cheese Veg", price: 89, category: "Burgers", vegType: "Veg", available: true, description: "Veg burger loaded with a slice of melting cheese." },
      { name: "Burger Non-Veg", price: 99, category: "Burgers", vegType: "Non-Veg", available: true, description: "Juicy chicken patty burger with special sauce." },
      { name: "Burger Cheese Non-Veg", price: 109, category: "Burgers", vegType: "Non-Veg", available: true, description: "Chicken burger topped with premium cheese." },
      { name: "Mini Pizzas Veg", price: 59, category: "Pizzas", vegType: "Veg", available: true, description: "Bite-sized pizzas with fresh veggie toppings." },
      { name: "Mini Pizzas Non-Veg", price: 69, category: "Pizzas", vegType: "Non-Veg", available: true, description: "Mini pizzas topped with savory chicken chunks." },
      { name: "Pancakes + Strawberry Dip", price: 99, category: "Combos", vegType: "Veg", available: true, description: "Fluffy pancakes served with our signature strawberry dip." },
      { name: "Marshmallows Dip + Nutella Pancake", price: 129, category: "Combos", vegType: "Veg", available: true, description: "The ultimate sweet combo of dips and pancakes." },
      { name: "Burger + Mini Pizza (Veg)", price: 119, category: "Combos", vegType: "Veg", available: true, description: "A satisfying combo of a veg burger and mini pizza." },
      { name: "Burger + Mini Pizza (Non-Veg)", price: 139, category: "Combos", vegType: "Non-Veg", available: true, description: "A hearty meal with a chicken burger and mini pizza." },
    ];
    try {
      const batch = writeBatch(db);
      fullMenu.forEach((item) => {
        const ref = doc(collection(db, "menu"));
        batch.set(ref, item);
      });
      await batch.commit();
      alert("All menu items added successfully");
    } catch (e) {
      alert("Error seeding: " + e.message);
    }
  };

  const deleteItem = async (id) => {
    if (confirm("Delete this item?")) {
      await deleteDoc(doc(db, "menu", id));
    }
  };

  const deleteAll = async () => {
    if (confirm("Delete ALL items?")) {
      const batch = writeBatch(db);
      menu.forEach((item) => {
        batch.delete(doc(db, "menu", item.id));
      });
      await batch.commit();
      alert("All items deleted");
    }
  };

  const handleItemChange = (id, field, value) => {
    setMenu((prev) => prev.map((it) => it.id === id ? { ...it, [field]: value } : it));
  };

  const saveItem = async (item) => {
    const payload = {
      name: item.name || "",
      price: Number(item.price) || 0,
      category: item.category || "Dips",
      vegType: item.vegType || "Veg",
      available: Boolean(item.available),
      description: item.description || "",
      imageUrl: item.imageUrl || ""
    };
    await updateDoc(doc(db, "menu", item.id), payload);
  };

  const toggleAvailability = async (id, current) => {
    await updateDoc(doc(db, "menu", id), { available: !current });
  };

  const handleAdd = async () => {
    const payload = {
      name: newItem.name.trim(),
      price: Number(newItem.price) || 0,
      category: newItem.category,
      vegType: newItem.vegType,
      available: Boolean(newItem.available),
      description: newItem.description.trim(),
      imageUrl: newItem.imageUrl.trim()
    };
    await addDoc(collection(db, "menu"), payload);
    setNewItem({
      name: "",
      price: "",
      category: "Dips",
      vegType: "Veg",
      available: true,
      description: "",
      imageUrl: ""
    });
  };

  const filteredMenu = menu
    .filter(it => categoryFilter === "All" ? true : it.category === categoryFilter)
    .filter(it => availabilityFilter === "All" ? true : availabilityFilter === "Available" ? it.available !== false : it.available === false)
    .filter(it => it.name?.toLowerCase().includes(search.toLowerCase()));

  // Group menu items by category (same as main page)
  const menuByCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = filteredMenu
      .filter(item => item.category === cat)
      .slice()
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return acc;
  }, {});

  // If the user state is empty, show nothing (prevents "flashing" admin content)
  if (!user) return <div className="p-20 text-center">Checking authorization...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          {/* Accept Orders Toggle */}
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg shadow border">
            <span className="text-sm font-semibold text-gray-700">Accept Orders:</span>
            <button
              onClick={toggleAcceptOrders}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${acceptingOrders ? 'bg-green-500' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${acceptingOrders ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
            <span className={`text-sm font-bold ${acceptingOrders ? 'text-green-600' : 'text-red-600'}`}>
              {acceptingOrders ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="space-x-2">
            <a href="/orders" className="bg-purple-600 text-white px-4 py-2 rounded font-bold hover:bg-purple-700 transition">View Orders</a>
            <a href="/stats" className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 transition">View Stats</a>
            <button onClick={seedItems} className="bg-green-600 text-white px-4 py-2 rounded font-bold">Seed Default Menu</button>
            <button onClick={deleteAll} className="bg-red-600 text-white px-4 py-2 rounded font-bold">Delete All</button>
          </div>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-6 border">
        <h2 className="text-xl font-bold mb-4">🔍 Search & Filter Menu Items</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Search by Name</label>
            <input
              className="border p-2 rounded w-full"
              placeholder="Search items by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Filter by Category</label>
            <select
              className="border p-2 rounded w-full"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option>All</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Filter by Availability</label>
            <select
              className="border p-2 rounded w-full"
              value={availabilityFilter}
              onChange={e => setAvailabilityFilter(e.target.value)}
            >
              <option>All</option>
              <option>Available</option>
              <option>Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add New Item Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-6 border">
        <h2 className="text-xl font-bold mb-4">➕ Add New Menu Item</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Item Name</label>
            <input
              className="border p-2 rounded w-full"
              placeholder="Enter item name"
              value={newItem.name}
              onChange={e => setNewItem({ ...newItem, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Price (₹)</label>
            <input
              className="border p-2 rounded w-full"
              type="number"
              placeholder="Enter price"
              value={newItem.price}
              onChange={e => setNewItem({ ...newItem, price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
            <select
              className="border p-2 rounded w-full"
              value={newItem.category}
              onChange={e => setNewItem({ ...newItem, category: e.target.value })}
            >
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Veg Type</label>
            <select
              className="border p-2 rounded w-full"
              value={newItem.vegType}
              onChange={e => setNewItem({ ...newItem, vegType: e.target.value })}
            >
              <option>Veg</option>
              <option>Non-Veg</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Image URL</label>
            <input
              className="border p-2 rounded w-full"
              placeholder="Enter image URL"
              value={newItem.imageUrl}
              onChange={e => setNewItem({ ...newItem, imageUrl: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              className="border p-2 rounded w-full"
              placeholder="Enter item description"
              value={newItem.description}
              onChange={e => setNewItem({ ...newItem, description: e.target.value })}
              rows="3"
            />
          </div>
          <div className="flex items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newItem.available}
                onChange={e => setNewItem({ ...newItem, available: e.target.checked })}
                className="cursor-pointer"
              />
              <span className="text-sm font-semibold text-gray-700">Available</span>
            </label>
          </div>
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded font-bold md:col-span-2 hover:bg-blue-700 transition"
          >
            Add Item
          </button>
        </div>
      </div>

      {/* Menu Items by Category */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-4">📋 Menu Items ({filteredMenu.length})</h2>
      </div>

      {filteredMenu.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border shadow-sm">
          <p className="text-gray-500">No items found matching your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = menuByCategory[cat] || [];
            if (items.length === 0) return null; // Don't show empty categories

            const isOpen = openCategory === cat;
            return (
              <div key={cat} className="border border-gray-200 rounded-xl bg-white">
                <button
                  onClick={() => setOpenCategory(isOpen ? null : cat)}
                  className="w-full text-left px-4 py-3 font-bold flex justify-between items-center hover:bg-gray-50 transition rounded-t-xl"
                >
                  <span className="text-lg">{cat} ({items.length})</span>
                  <span className="text-blue-600 text-xl">{isOpen ? "−" : "+"}</span>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-4">
                    {items.map(item => (
                      <div key={item.id} className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-28 object-cover rounded mb-3" />
                        ) : (
                          <div className="w-full h-28 bg-gray-200 rounded mb-3 flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        )}
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs px-2 py-1 rounded-full border bg-white">{item.category}</span>
                          <button onClick={() => deleteItem(item.id)} className="text-red-600 font-bold text-xs hover:text-red-700">Delete</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Item Name</label>
                            <input className="border p-2 rounded w-full text-sm" value={item.name || ""} onChange={e => handleItemChange(item.id, "name", e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Price (₹)</label>
                            <input className="border p-2 rounded w-full text-sm" type="number" value={item.price ?? 0} onChange={e => handleItemChange(item.id, "price", e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                            <select className="border p-2 rounded w-full text-sm" value={item.category || "Dips"} onChange={e => handleItemChange(item.id, "category", e.target.value)}>
                              {categories.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Veg Type</label>
                            <select className="border p-2 rounded w-full text-sm" value={item.vegType || "Veg"} onChange={e => handleItemChange(item.id, "vegType", e.target.value)}>
                              <option>Veg</option>
                              <option>Non-Veg</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Image URL</label>
                            <input className="border p-2 rounded w-full text-sm" value={item.imageUrl || ""} onChange={e => handleItemChange(item.id, "imageUrl", e.target.value)} placeholder="Enter image URL" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                            <textarea className="border p-2 rounded w-full text-sm" value={item.description || ""} onChange={e => handleItemChange(item.id, "description", e.target.value)} placeholder="Enter description" rows="2" />
                          </div>
                          <div className="col-span-2 flex items-center gap-4">
                            <label className="flex items-center gap-2 ml-auto cursor-pointer">
                              <input type="checkbox" checked={item.available !== false} onChange={() => toggleAvailability(item.id, item.available !== false)} className="cursor-pointer" />
                              <span className="text-sm font-semibold text-gray-700">{item.available !== false ? "Available" : "Disabled"}</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => saveItem(item)} className="bg-black text-white px-4 py-2 rounded font-bold text-sm hover:bg-gray-800 transition w-full">
                            Save
                          </button>
                        </div>
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
  );
}
