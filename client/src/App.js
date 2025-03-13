import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ERCProtestForm from './components/ERCProtestForm';
import AdminDashboard from './components/AdminDashboard';
import QueueDisplay from './components/QueueDisplay';
import { Box, Container, Grid } from '@mui/material';

// Updated App component with right-side queue
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={9}>
                <ERCProtestForm />
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ position: { md: 'sticky' }, top: { md: '20px' }, height: { md: 'calc(100vh - 40px)' } }}>
                  <QueueDisplay />
                </Box>
              </Grid>
            </Grid>
          </Container>
        } />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;