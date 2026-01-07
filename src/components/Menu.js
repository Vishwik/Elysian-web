import React, { useState } from 'react';

export default function ElysianMenu({ items, addToCart }) {
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.id} className="border rounded-lg p-4 shadow-md bg-white text-gray-900">
          <h3 className="text-xl font-bold">{item.name}</h3>
          <p className="text-gray-600">₹{item.price}</p>
          <button 
            onClick={() => addToCart(item)}
            className="mt-3 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
          >
            Add to Order
          </button>
        </div>
      ))}
    </div>
  );
}