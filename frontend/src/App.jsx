import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PlatformsPage from './pages/PlatformsPage';
import OrdersPage from './pages/OrdersPage';
import ProductivityCalculatorPage from './pages/ProductivityCalculatorPage';
import MarketplacePriceSetPage from './pages/MarketplacePriceSetPage';
import './App.css';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/platforms"
          element={
            <PrivateRoute>
              <PlatformsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <PrivateRoute>
              <OrdersPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/calculator"
          element={
            <PrivateRoute>
              <ProductivityCalculatorPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/marketplace-price-set"
          element={
            <PrivateRoute>
              <MarketplacePriceSetPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}
