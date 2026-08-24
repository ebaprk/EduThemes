from src.llm.openai_analysis import navigator_llm

def serve_llm(choice):
    if choice == "navigator":
        return navigator_llm

    raise ValueError("Select NaviGator AI before starting the analysis.")
