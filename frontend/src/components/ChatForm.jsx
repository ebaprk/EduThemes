import React, { useRef } from "react";
import { MdArrowUpward } from "react-icons/md";

const ChatForm = ({ generateBotResponse, isLoading }) => {
  const inputRef = useRef();

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const userMessage = inputRef.current.value.trim();
    if (!userMessage || isLoading) return;
    
    inputRef.current.value = "";
    generateBotResponse(userMessage);
  };

  return (
    <form action="#" className="chat-form" onSubmit={handleFormSubmit}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Ask about using this page..."
        className="message-input"
        required
        disabled={isLoading}
      />
      <button type="submit" aria-label="Send message" disabled={isLoading}>
        <MdArrowUpward />
      </button>
    </form>
  );
};

export default ChatForm;
