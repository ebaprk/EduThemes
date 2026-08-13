import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-bootstrap';

const WorkflowAlert = ({ message, onClose, heading, className = '' }) => {
  const alertRef = useRef(null);

  useEffect(() => {
    if (message) alertRef.current?.focus();
  }, [message]);

  if (!message) return null;

  return (
    <Alert
      ref={alertRef}
      variant="danger"
      role="alert"
      tabIndex="-1"
      className={`workflow-alert ${className}`.trim()}
      dismissible
      onClose={onClose}
    >
      {heading && <Alert.Heading as="h2">{heading}</Alert.Heading>}
      <div>{message}</div>
    </Alert>
  );
};

export default WorkflowAlert;
