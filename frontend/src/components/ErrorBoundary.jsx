import React from 'react';
import { Notice } from "@eduthemes/ui/workbench";
import { AlertTitle } from "@eduthemes/ui/components/alert";
import { Button } from "@eduthemes/ui/components/button";
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false
    };
  }
  static getDerivedStateFromError() {
    return {
      hasError: true
    };
  }
  componentDidCatch(error, info) {
    console.error('Unexpected interface error:', error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="workflow-page">
        <Notice variant="danger" role="alert" className="workflow-alert">
          <AlertTitle>We couldn’t display this step</AlertTitle>
          <p>Your analysis is still saved in this browser session. Reload the page to try again.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={() => window.location.reload()}>Reload this step</Button>
            <Button variant="outline" href="/">Return home</Button>
          </div>
        </Notice>
      </main>;
  }
}
export default ErrorBoundary;
