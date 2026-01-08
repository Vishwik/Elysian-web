import { useState } from 'react';
import { auth } from '../lib/firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/admin'); // Send you to admin after successful login
    } catch (error) {
      alert("Login Failed: " + error.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">🔐 Admin Login</h1>
        <input 
          type="email" placeholder="Email" className="w-full border p-3 rounded mb-4"
          onChange={(e) => setEmail(e.target.value)} 
        />
        <input 
          type="password" placeholder="Password" className="w-full border p-3 rounded mb-6"
          onChange={(e) => setPassword(e.target.value)} 
        />
        <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-bold">Login</button>
      </form>
    </div>
  );
}