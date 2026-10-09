import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Participant from './components/Participant';
import './App.css';

export default function ParticipantApp() {
  return (
    <BrowserRouter>
      <div className="App">
        <Header />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Participant />} />
            <Route path="/join" element={<Participant />} />
            <Route path="/join/:code" element={<Participant />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
