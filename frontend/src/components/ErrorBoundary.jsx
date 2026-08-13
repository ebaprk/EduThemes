import React from 'react';
import { Alert, Button, Container } from 'react-bootstrap';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unexpected interface error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Container className="workflow-page">
        <Alert variant="danger" role="alert" className="workflow-alert">
          <Alert.Heading>We couldn’t display this step</Alert.Heading>
          <p>Your analysis is still saved in this browser session. Reload the page to try again.</p>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => window.location.reload()}>Reload this step</Button>
            <Button variant="outline-danger" href="/">Return home</Button>
          </div>
        </Alert>
      </Container>
    );
  }
}

export default ErrorBoundary;
