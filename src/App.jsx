import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CallPage from "./pages/CallPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100 text-gray-900">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/call/:userId" element={<CallPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
