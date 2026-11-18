import React, { useEffect, useRef } from 'react';
import { Notice } from "@eduthemes/ui/workbench";
import { AlertTitle } from "@eduthemes/ui/components/alert";
const WorkflowAlert = ({
  message,
  onClose,
  heading,
  className = ''
}) => {
  const alertRef = useRef(null);
  useEffect(() => {
    if (message) alertRef.current?.focus();
  }, [message]);
  if (!message) return null;
  return <Notice ref={alertRef} variant="danger" role="alert" tabIndex="-1" className={`workflow-alert ${className}`.trim()} dismissible onClose={onClose}>
      {heading && <AlertTitle as="h2">{heading}</AlertTitle>}
      <div>{message}</div>
    </Notice>;
};
export default WorkflowAlert;
