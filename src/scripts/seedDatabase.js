import { db } from '../lib/firebaseConfig';
import { collection, addDoc } from "firebase/firestore";

const menuItems = [ /* Paste the JSON from Step 2 here */ ];

export const seedDatabase = async () => {
  const menuCollection = collection(db, "menu");
  
  for (const item of menuItems) {
    try {
      await addDoc(menuCollection, item);
      console.log(`Added: ${item.name}`);
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  }
  alert("Database seeded successfully!");
};