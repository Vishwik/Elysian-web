import { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebaseConfig';
import { collection, addDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';

export default function SeedUpdates() {
    const [user, setUser] = useState(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState("Idle");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsubscribe();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            alert(e.message);
        }
    };

    const allItems = [
        // New Items
        { name: "Biscoff Cheesecake", price: 149, category: "Cheesecakes", vegType: "Veg", available: true, description: "Rich and creamy Biscoff cheesecake.", imageUrl: "" },
        { name: "Blueberry Cheesecake", price: 139, category: "Cheesecakes", vegType: "Veg", available: true, description: "Classic cheesecake with blueberry topping.", imageUrl: "" },
        { name: "Chocolate Cheesecake", price: 139, category: "Cheesecakes", vegType: "Veg", available: true, description: "Decadent chocolate cheesecake.", imageUrl: "" },
        { name: "Chocopops", price: 99, category: "Specials", vegType: "Veg", available: true, description: "Delicious bite-sized chocolate pops.", imageUrl: "" },

        // Existing Items (Updating Descriptions)
        { name: "Strawberry Dip", description: "Fresh strawberries paired with a rich chocolate dip." },
        { name: "Strawberry Thangulu", description: "Crunchy candied strawberries on a stick." },
        { name: "Marshmallow Dip", description: "Fluffy marshmallows with a side of warm chocolate sauce." },
        { name: "Marshmallow Toasted (5pcs)", description: "Perfectly toasted golden-brown marshmallows." },
        { name: "Biscuit Marshmallow (5pcs)", description: "Marshmallows sandwiched between crispy biscuits." },
        { name: "Pancakes (Plain)", description: "Fluffy, golden pancakes served with butter." },
        { name: "Pancakes + Honey", description: "Classic pancakes drizzled with pure honey." },
        { name: "Pancakes + Honey & Fruits", description: "Pancakes topped with honey and fresh seasonal fruits." },
        { name: "Pancakes + Nutella", description: "Indulgent pancakes smothered in Nutella." },
        { name: "Veg Burger", description: "Classic vegetable patty burger with fresh lettuce and mayo." },
        { name: "Burger Cheese Veg", description: "Veg burger loaded with a slice of melting cheese." },
        { name: "Burger Non-Veg", description: "Juicy chicken patty burger with special sauce." },
        { name: "Burger Cheese Non-Veg", description: "Chicken burger topped with premium cheese." },
        { name: "Mini Pizzas Veg", description: "Bite-sized pizzas with fresh veggie toppings." },
        { name: "Mini Pizzas Non-Veg", description: "Mini pizzas topped with savory chicken chunks." },
        { name: "Pancakes + Strawberry Dip", description: "Fluffy pancakes served with our signature strawberry dip." },
        { name: "Marshmallows Dip + Nutella Pancake", description: "The ultimate sweet combo of dips and pancakes." },
        { name: "Burger + Mini Pizza (Veg)", description: "A satisfying combo of a veg burger and mini pizza." },
        { name: "Burger + Mini Pizza (Non-Veg)", description: "A hearty meal with a chicken burger and mini pizza." },
    ];

    const runSeed = async () => {
        if (!user) return alert("Please login first");
        setStatus("Running...");
        try {
            const menuRef = collection(db, "menu");

            for (const item of allItems) {
                const q = query(menuRef, where("name", "==", item.name));
                const snap = await getDocs(q);

                if (snap.empty) {
                    // Add if missing
                    if (item.price) { // Only add if it's a full item object, not just a description update
                        await addDoc(menuRef, item);
                        console.log(`Added: ${item.name}`);
                    }
                } else {
                    // Update description if exists
                    const docRef = snap.docs[0].ref;
                    await updateDoc(docRef, { description: item.description });
                    console.log(`Updated description: ${item.name}`);
                }
            }
            setStatus("Done! Check console for details.");
        } catch (e) {
            console.error(e);
            setStatus(`Error: ${e.message}`);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-96">
                    <h1 className="text-2xl font-bold mb-6 text-center">🔐 Admin Login Needed</h1>
                    <input
                        type="email" placeholder="Email" className="w-full border p-3 rounded mb-4"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        type="password" placeholder="Password" className="w-full border p-3 rounded mb-6"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-bold">Login to Update</button>
                </form>
            </div>
        );
    }

    return (
        <div className="p-10 text-center">
            <h1 className="text-2xl font-bold mb-4">Update Menu Descriptions</h1>
            <p className="mb-4 text-green-600">Logged in as {user.email}</p>
            <button
                onClick={runSeed}
                className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 font-bold"
            >
                Update Descriptions
            </button>
            <p className="mt-4 font-mono text-lg">{status}</p>
        </div>
    );
}
