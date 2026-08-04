import React, { useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { FaFileAlt, FaSyncAlt, FaListUl, FaLightbulb } from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';

const Start = ({ onSessionStart, onAdvanceStage, setLabels }) => {
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState(null);

    const startSession = async () => {
        if (isStarting) return;

        setError(null);
        setIsStarting(true);

        try {
            const response = await axios.post(`${API_URL}/session/start`);

            if (!response.data?.session_id) {
                throw new Error('The server did not return a session ID.');
            }

            setLabels([]);
            onSessionStart(response.data.session_id);
            onAdvanceStage();
        } catch (error) {
            console.error('Session start error:', error.response || error);
            setError(getApiErrorMessage(error, 'We couldn\'t start your analysis.'));
        } finally {
            setIsStarting(false);
        }
    };

    const containerStyle = {
        height: 'auto',
        paddingBottom: '50px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: 'sans-serif',
    };

    const windowStyle = {
        border: '4px solid black',
        width: '100vh',
        height: 'auto',
        padding: '35px',
        borderRadius: '12px',
        boxShadow: '8px 8px 0 black',
    };

    const titleStyle = {
        fontSize: '48px',
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: '10px',
    };

    const sectionTitleStyle = {
        fontSize: '28px',
        fontWeight: '600',
        marginTop: '20px',
        textAlign: 'center',
    };

    const paragraphStyle = {
        fontSize: '16px',
        textAlign: 'center',
        marginBottom: '20px',
    };

    const featuresStyle = {
        display: 'flex',
        justifyContent: 'space-around',
        flexWrap: 'wrap',
        marginTop: '10px',
    };

    const featureItemStyle = {
        textAlign: 'center',
        margin: '20px',
    };

    const iconStyle = {
        fontSize: '40px',
        marginBottom: '10px',
    };

    return (
        <div style={containerStyle}>
            <div style={windowStyle} className="bg-light">
                <div style={titleStyle}>EduThemes</div>
                <div style={{
                    fontSize: '16px',
                    textAlign: 'center',
                    marginTop: '10px',
                    marginBottom: '30px',
                    lineHeight: '1.6',
                    maxWidth: '700px',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                }}>
                    EduThemes helps you discover the main ideas and themes from your survey responses.
                    It uses AI to group similar answers together and summarize them into clear insights,
                    so you can understand your data faster and make informed decisions.
                </div>

                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    {error && (
                        <Alert
                            variant="danger"
                            role="alert"
                            dismissible
                            onClose={() => setError(null)}
                            className="text-start"
                        >
                            <Alert.Heading as="h2" className="h6">Unable to start analysis</Alert.Heading>
                            <div>{error}</div>
                        </Alert>
                    )}
                    <Button
                        variant="primary"
                        onClick={startSession}
                        disabled={isStarting}
                        aria-busy={isStarting}
                        style={{
                            fontWeight: 'bold',
                            padding: '10px 20px',
                            fontSize: '16px',
                        }}
                    >
                        {isStarting ? (
                            <>
                                <Spinner
                                    as="span"
                                    animation="border"
                                    size="sm"
                                    role="status"
                                    aria-hidden="true"
                                    className="me-2"
                                />
                                Starting analysis...
                            </>
                        ) : (
                            'Start Analysis'
                        )}
                    </Button>
                </div>
                <hr/>
                <div>
                    <div style={sectionTitleStyle}>Features</div>
                    <div style={featuresStyle}>
                        <div style={featureItemStyle}>
                            <FaFileAlt style={iconStyle} />
                            <div>Upload<br />text responses</div>
                        </div>
                        <div style={featureItemStyle}>
                            <FaSyncAlt style={iconStyle} />
                            <div>Preprocess<br />your data</div>
                        </div>
                        <div style={featureItemStyle}>
                            <FaListUl style={iconStyle} />
                            <div>Retrieve<br />main themes</div>
                        </div>
                        <div style={featureItemStyle}>
                            <FaLightbulb style={iconStyle} />
                            <div>Gain<br />key insights</div>
                        </div>
                    </div>
                </div>
                <hr/>
                <div style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    textAlign: 'center',
                    marginTop: '20px',
                    marginBottom: '10px'
                }}>
                    How to Use
                </div>
                <ul style={{
                    textAlign: 'left',
                    maxWidth: '700px',
                    margin: '0 auto',
                    lineHeight: '1.8',
                    fontSize: '16px',
                    maxHeight: '8vh',
                    overflowY: 'auto',
                }}>
                    <li><strong>Start an Analysis:</strong> Click the "Start Analysis" button to begin.</li>
                    <li><strong>Upload Your Dataset:</strong> Upload your file of text responses.</li>
                    <li><strong>Edit Labels:</strong> Review or modify the preprocessed data (optional).</li>
                    <li><strong>Run the Analysis:</strong> AI will group similar responses into themes.</li>
                    <li><strong>View Results:</strong> Explore the key themes in your data.</li>
                    <li><strong>Take Action:</strong> Get suggestions based on the findings.</li>
                </ul>
            </div>
        </div>
    );
};

export default Start;
