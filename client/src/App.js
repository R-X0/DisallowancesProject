import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ERCProtestForm from './components/ERCProtestForm';
import AdminDashboard from './components/AdminDashboard';
import { Container } from '@mui/material';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
            <ERCProtestForm />
          </Container>
        } />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;