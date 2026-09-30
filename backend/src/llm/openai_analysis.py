import os
import json
import random
import openai

NAVIGATOR_BASE_URL = os.getenv('NAVIGATOR_BASE_URL', 'https://api.ai.it.ufl.edu/v1')
NAVIGATOR_MODEL = os.getenv('NAVIGATOR_MODEL', 'nemotron-3-super-120b-a12b')


class NavigatorError(RuntimeError):
    def __init__(self, message, code='NAVIGATOR_FAILED', status=502, retryable=True):
        super().__init__(message)
        self.code = code
        self.status = status
        self.retryable = retryable


def _resolve_api_key(api_key=None):
    resolved_key = api_key or os.getenv('NAVIGATOR_API_KEY')
    if not resolved_key:
        raise NavigatorError(
            'NaviGator AI is not configured on the analysis service.',
            'NAVIGATOR_NOT_CONFIGURED', 503, False,
        )
    return resolved_key


def _create_client(api_key=None):
    return openai.OpenAI(
        api_key=_resolve_api_key(api_key),
        base_url=NAVIGATOR_BASE_URL,
    )


def _chat_completion(client, prompt, max_tokens=None, response_format=None):
    request = {
        'model': NAVIGATOR_MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
    }
    if max_tokens is not None:
        request['max_tokens'] = max_tokens
    if response_format is not None:
        request['response_format'] = response_format
    # Nemotron spends the output allowance on hidden reasoning by default.
    if NAVIGATOR_MODEL.startswith('nemotron-3-'):
        request['extra_body'] = {'chat_template_kwargs': {'enable_thinking': False}}

    try:
        response = client.chat.completions.create(**request)
    except openai.AuthenticationError as exc:
        raise NavigatorError('NaviGator rejected the configured API key. Check NAVIGATOR_API_KEY.', 'NAVIGATOR_AUTH_FAILED', 502, False) from exc
    except openai.PermissionDeniedError as exc:
        raise NavigatorError('This NaviGator key cannot access the selected model.', 'NAVIGATOR_ACCESS_DENIED', 502, False) from exc
    except openai.RateLimitError as exc:
        raise NavigatorError('NaviGator is rate limiting requests. Wait a moment and retry.', 'NAVIGATOR_RATE_LIMITED', 503) from exc
    except openai.APITimeoutError as exc:
        raise NavigatorError('NaviGator took too long to respond. Please retry.', 'NAVIGATOR_TIMEOUT', 504) from exc
    except openai.APIConnectionError as exc:
        raise NavigatorError('The analysis service could not connect to NaviGator. Please retry.', 'NAVIGATOR_UNREACHABLE', 502) from exc
    except openai.APIStatusError as exc:
        raise NavigatorError('NaviGator could not process this request. Please retry.', 'NAVIGATOR_API_ERROR', 502) from exc

    if not response.choices:
        raise NavigatorError('NaviGator returned no response. Please retry.', 'NAVIGATOR_EMPTY_RESPONSE')
    choice = response.choices[0]
    if choice.finish_reason == 'length':
        raise NavigatorError('NaviGator ran out of output space. Please retry.', 'NAVIGATOR_OUTPUT_TRUNCATED')
    content = choice.message.content
    if not isinstance(content, str) or not content.strip():
        raise NavigatorError('NaviGator returned no readable text. Please retry.', 'NAVIGATOR_EMPTY_RESPONSE')
    return content


class navigator_llm:
    @staticmethod
    def suggest_themes(responses, research_question="", project_description="", predefined_themes=None, api_key=None, max_themes=8):
        client = _create_client(api_key)
        
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
        
        Return only a valid JSON array of objects, each with "name" and "description" keys.
        """
        
        try:
            result_text = _chat_completion(client, prompt, max_tokens=2048)
            json_start = result_text.find('[')
            json_end = result_text.rfind(']') + 1
            
            if json_start >= 0 and json_end > 0:
                json_str = result_text[json_start:json_end]
                try:
                    suggested_themes = json.loads(json_str)
                    
                    if not isinstance(suggested_themes, list):
                        raise NavigatorError('NaviGator returned an unreadable theme list. Please retry.', 'NAVIGATOR_INVALID_OUTPUT')
                    cleaned_themes = []
                    for theme in suggested_themes:
                        if isinstance(theme, dict) and 'name' in theme and 'description' in theme:
                            cleaned_themes.append({
                                'name': theme['name'],
                                'description': theme['description']
                            })
                    
                    if not cleaned_themes:
                        raise NavigatorError('NaviGator returned no usable themes. Please retry.', 'NAVIGATOR_INVALID_OUTPUT')
                    return cleaned_themes[:max_themes]
                except json.JSONDecodeError as e:
                    raise NavigatorError('NaviGator returned an unreadable theme list. Please retry.', 'NAVIGATOR_INVALID_OUTPUT') from e
            else:
                raise NavigatorError('NaviGator returned an unreadable theme list. Please retry.', 'NAVIGATOR_INVALID_OUTPUT')
        except NavigatorError:
            raise
        except Exception as e:
            raise NavigatorError('NaviGator could not generate theme suggestions. Please retry.') from e

    @staticmethod
    def classify_responses_by_themes(responses, themes, research_question="", project_description="", api_key=None, batch_size=10, manual_codes=None):
        client = _create_client(api_key)

        theme_names = [theme['name'] for theme in themes]
        classifications = {theme_name: [] for theme_name in theme_names}
        mcodes = {}
        for code in manual_codes or []:
            if code.get('themes'):
                mcodes[code['index']] = code['themes'][0]

        for i in range(0, len(responses), batch_size):
            batch = responses[i:i+batch_size]
            theme_text = "\n".join(
                f"- {theme['name']}: {theme.get('description', '')}" for theme in themes
            )
            response_lines = []
            for j, resp in enumerate(batch):
                line = f"Response {j+1}: {json.dumps(str(resp))}"
                if i + j in mcodes:
                    line += f"; manually coded theme: {mcodes[i+j]['name']}"
                response_lines.append(line)
            response_text = "\n".join(response_lines)

            prompt = f"""
            You are analyzing responses for a qualitative research project.

            Research Question: {research_question}
            Project Description: {project_description}

            Analyze each response and determine which themes apply. Be critical and selective.

            Themes:
            {theme_text}

            Responses:
            {response_text}

            Return one classification for every response number from 1 through {len(batch)}.
            A response may match multiple themes or none at all.
            Return only a JSON object with a "classifications" array. Each array item
            must have an integer "response_num" and a "themes" array of theme names.
            Use only exact theme names from the list above. Use [] when no theme clearly fits.
            """

            batch_results = None
            for _ in range(2):
                result_text = _chat_completion(
                    client, prompt, max_tokens=2048,
                    response_format={'type': 'json_object'},
                )
                try:
                    payload = json.loads(result_text)
                    results = payload['classifications']
                    if not isinstance(results, list) or len(results) != len(batch):
                        continue
                    by_number = {}
                    for item in results:
                        number = item['response_num']
                        assigned = item['themes']
                        if (type(number) is not int or number < 1 or number > len(batch)
                                or number in by_number or not isinstance(assigned, list)
                                or any(not isinstance(name, str) or name not in theme_names for name in assigned)):
                            break
                        by_number[number] = assigned
                    if len(by_number) == len(batch):
                        batch_results = by_number
                        break
                except (json.JSONDecodeError, KeyError, TypeError):
                    continue

            if batch_results is None:
                raise NavigatorError(
                    f"NaviGator returned incomplete classifications for batch {i // batch_size + 1}. Please retry.",
                    'NAVIGATOR_INVALID_OUTPUT',
                )

            for number in range(1, len(batch) + 1):
                assigned_themes = batch_results[number]
                response_index = i + number - 1
                if not assigned_themes:
                    classifications.setdefault('Unclassified', []).append(response_index)
                for theme_name in set(assigned_themes):
                    classifications[theme_name].append(response_index)

        return classifications

    @staticmethod
    def generate_summary(responses, themes, classifications, research_question="", project_description="", api_key=None):
        client = _create_client(api_key)
        
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
        
        return _chat_completion(client, prompt, max_tokens=3072)

    @staticmethod
    def process_chat_query(query, responses, themes, classifications, research_question="", project_description="", api_key=None):
        client = _create_client(api_key)
        
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
        
        
        return _chat_completion(client, prompt, max_tokens=2048)
