import os
import json
import random
from anthropic import Anthropic

deflt_key = os.getenv('ANTHROPIC_API_KEY')
class claude_llm:
    @staticmethod
    def suggest_themes(responses, research_question="", project_description="", predefined_themes=None, api_key=deflt_key, max_themes=8):
        
        client = Anthropic(api_key=api_key)
        
        predefined_text = ""
        if predefined_themes and len(predefined_themes) > 0:
            predefined_text = "Predefined Themes:\n"
            for theme in predefined_themes:
                predefined_text += f"- {theme['name']}: {theme.get('description', 'No description')}\n"
        
        max_samples = min(40, len(responses))
        sampled_responses = responses[:max_samples]
        responses_text = "\n".join([f"- {response}" for response in sampled_responses])
        
        prompt = f"""
        You are an expert in qualitative data analysis. Based on the responses provided, suggest meaningful themes for analysis.

        Research Question: {research_question}
        
        Project Description: {project_description}
        
        {predefined_text}
        
        Responses (sample of {max_samples} out of {len(responses)} total):
        {responses_text}
        
        Please identify up to {max_themes} themes that emerge from these responses. For each theme, provide:
        1. A concise, descriptive name (4 words or less)
        2. A brief description of what the theme encompasses (one sentence)

        If predefined themes are provided, suggest themes that do not duplicate or have the same meaning.
        
        Return your response as a JSON array of objects, each with "name" and "description" keys. For example:
        [
            {{"name": "Theme Name", "description": "Theme description"}},
            ...
        ]
        """
        
        try:
            response = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            result_text = response.content[0].text
            json_start = result_text.find('[')
            json_end = result_text.rfind(']') + 1
            
            if json_start >= 0 and json_end > 0:
                json_str = result_text[json_start:json_end]
                try:
                    suggested_themes = json.loads(json_str)
                    
                    cleaned_themes = []
                    for theme in suggested_themes:
                        if isinstance(theme, dict) and 'name' in theme and 'description' in theme:
                            cleaned_themes.append({
                                'name': theme['name'],
                                'description': theme['description']
                            })
                    
                    return cleaned_themes[:max_themes]
                except json.JSONDecodeError as e:
                    raise RuntimeError("The model returned an unreadable theme list.") from e
            else:
                raise RuntimeError("The model returned an unreadable theme list.")
                
        except Exception as e:
            raise RuntimeError("Claude could not generate theme suggestions.") from e

    @staticmethod
    def classify_responses_by_themes(responses, themes, research_question="", project_description="", api_key=deflt_key, batch_size=10, manual_codes = None):
        if api_key is None or api_key == '':
            api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("Claude is not configured on the analysis service.")
        
        client = Anthropic(api_key=api_key)
        
        theme_names = [theme['name'] for theme in themes]
        classifications = {theme_name: [] for theme_name in theme_names}
        
        mcodes = {}
        for code in manual_codes or []:
            if code.get('themes'):
                mcodes[code['index']] = code['themes'][0]

        
        for i in range(0, len(responses), batch_size):
            batch = responses[i:i+batch_size]
            batch_indices = list(range(i, min(i+batch_size, len(responses))))
            
            theme_text = ""
            for theme in themes:
                theme_text += f"- {theme['name']}: {theme.get('description', '')}\n"
            
            response_text = ""
            for j, resp in enumerate(batch):
                if mcodes.get(i+j) == None:

                    response_text += f"Response {j+1}: \"{resp}\"\n"
                else:
                    response_text += f"Response {j+1}: \"{resp}\" Themes related to this response: {mcodes[j+i]['name']}"
            
            prompt = f"""
            You are analyzing responses for a qualitative research project.
            
            Research Question: {research_question}
            Project Description: {project_description}
            
            Analyze each response and determine which themes apply. Responses will either be submitted individually or with themes associated. These theme names were selected by a human, and must be kept in the output. Be critical and selective.
            
            Themes:
            {theme_text}
            
            Responses:
            {response_text}
            
            For each response, return a JSON object with the response number and the themes that apply.
            A response may match multiple themes or none at all.
            
            Format your answer as a JSON array:
            [
                {{"response_num": 1, "themes": ["Theme1", "Theme2"]}},
                {{"response_num": 2, "themes": []}},  # This response doesn't match any themes
                {{"response_num": 3, "themes": ["Theme3"]}}
            ]
            
            IMPORTANT INSTRUCTIONS:
            1. Only include theme names that exactly match the provided list.
            2. Be strict in your assessment, don't force a response into a theme if it's not a clear match.
            3. It's acceptable that some responses won't fit any themes.
            4. Only classify a response under a theme if there is strong evidence in the text.
            """

            batch_processed = False
            

            if batch_processed:
                break
                ##model="claude-3-7-sonnet-20250219",
                # model="claude-3-7-sonnet-20250219",
            try:
                print(f"Processing batch {i//batch_size + 1}")
                api_response = client.messages.create(
                    model="claude-3-7-sonnet-20250219",
                    max_tokens=1000,
                    messages=[{"role": "user", "content": prompt}]
                )
                
                result_text = api_response.content[0].text
                json_start = result_text.find('[')
                json_end = result_text.rfind(']') + 1
                
                if json_start >= 0 and json_end > 0:
                    json_str = result_text[json_start:json_end]
                    try:
                        results = json.loads(json_str)
                        
                        for item in results:
                            resp_idx = item.get('response_num', 0) - 1
                            if 0 <= resp_idx < len(batch):
                                global_idx = batch_indices[resp_idx]
                                assigned_themes = item.get('themes', [])

                                if assigned_themes == []:
                                    if "Unclassified" not in classifications:
                                        classifications["Unclassified"] = []
                                    classifications["Unclassified"].append(global_idx)
                                
                                for theme_name in assigned_themes:
                                    if theme_name in theme_names:
                                        classifications[theme_name].append(global_idx)
                                        
                        batch_processed = True
                    except json.JSONDecodeError:
                        print(f"Error parsing JSON for batch {i//batch_size + 1}")
                else:
                    print(f"No valid JSON found for batch {i//batch_size + 1}")
            
            except Exception as e:
                raise RuntimeError(f"Claude could not classify response batch {i // batch_size + 1}.") from e

            if not batch_processed:
                raise RuntimeError(f"Claude returned an unreadable classification for batch {i // batch_size + 1}.")
        
        return classifications

    @staticmethod
    def generate_summary(responses, themes, classifications, research_question="", project_description="", api_key=deflt_key):
        if api_key is None or api_key == '':
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                print("No API key provided.")
        
        client = Anthropic(api_key=api_key)
        
        theme_stats = {}
        total_responses = len(responses)
        
        for theme_name, response_indices in classifications.items():
            count = len(response_indices)
            percentage = (count / total_responses) * 100 if total_responses > 0 else 0
            
            description = next((theme['description'] for theme in themes if theme['name'] == theme_name), f"Theme: {theme_name}")
            
            theme_stats[theme_name] = {
                'count': count,
                'percentage': percentage,
                'description': description
            }
        
        theme_examples = {}
        for theme_name, response_indices in classifications.items():
            if response_indices:
                sample_size = min(3, len(response_indices))
                if sample_size > 0:
                    if len(response_indices) > 3:
                        sampled_indices = random.sample(response_indices, sample_size)
                    else:
                        sampled_indices = response_indices[:sample_size]
                    
                    theme_examples[theme_name] = [responses[idx] for idx in sampled_indices]
        
        stats_text = ""
        for theme_name, stats in theme_stats.items():
            stats_text += f"Theme: {theme_name}\n"
            stats_text += f"Description: {stats['description']}\n"
            stats_text += f"Count: {stats['count']} responses ({stats['percentage']:.1f}%)\n"
            
            if theme_name in theme_examples and theme_examples[theme_name]:
                stats_text += "Example responses:\n"
                for i, example in enumerate(theme_examples[theme_name]):
                    if len(example) > 200:
                        example = example[:197] + "..."
                    stats_text += f"  - {example}\n"
            
            stats_text += "\n"
        
        prompt = f"""
        You are an expert in qualitative data analysis. Please generate a summary of the following analysis results.
        
        Research Question: {research_question}
        
        Project Description: {project_description}
        
        Analysis Statistics:
        Total responses analyzed: {total_responses}
        
        Theme Statistics:
        {stats_text}
        
        Based on this data, please provide:
        1. An summary of the key findings (1-2 paragraphs)
        2. Analysis of each theme, including its significance and patterns
        3. Relationships or correlations between themes, if any are apparent
        4. Insights that emerge from the data
        5. Recommendations for instructors or researchers based on these findings
        
        Format your summary in a clear, easy to print out summary in an academic context, dont use lists or numbers, just a paragraph.
        """
        
        try:
            print(f"Generating summary")
            response = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            summary_text = response.content[0].text
            return summary_text
                
        except Exception as e:
            raise RuntimeError("Claude could not generate the analysis summary.") from e

    @staticmethod
    def process_chat_query(query, responses, themes, classifications, research_question="", project_description="", api_key=deflt_key):
        if api_key is None or api_key == '':
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                print("No API key provided.")
                return "I can help analyze your dataset and explain the themes I've identified. What would you like to know more about?"
        
        client = Anthropic(api_key=api_key)
        
        theme_stats = []
        total_responses = len(responses)
        
        for theme in themes:
            theme_name = theme['name']
            if theme_name in classifications:
                count = len(classifications[theme_name])
                percentage = (count / total_responses) * 100 if total_responses > 0 else 0
                theme_stats.append({
                    'name': theme_name,
                    'description': theme.get('description', ''),
                    'count': count,
                    'percentage': percentage
                })
        theme_stats_text = ""
        for stat in theme_stats:
            theme_stats_text += f"- {stat['name']} ({stat['count']} responses, {stat['percentage']:.1f}%): {stat['description']}\n"
        
        prompt = f"""
        You are an AI assistant helping analyze qualitative data. Answer the following question based on the dataset information provided.
        
        Research Question: {research_question}
        Project Description: {project_description}
        
        Dataset: {total_responses} total responses
        
        Themes identified:
        {theme_stats_text}
        
        User's question: {query}
        
        Provide a helpful, informative response to the user's question, focusing on insights and patterns from the analysis.
        """
        
        
        try:
            response = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
                
        except Exception as e:
            print(f"Error processing chat query: {str(e)}")
