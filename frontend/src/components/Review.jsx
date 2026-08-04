import React, { useState, useEffect } from 'react';
import { Container, Button, Card, Row, Col, Modal, Badge, Spinner, Alert, ProgressBar, Nav, Tab, Form, ListGroup, OverlayTrigger} from 'react-bootstrap';
import { FaCheck, FaTimes, FaUndo } from 'react-icons/fa';
import axios, { all } from 'axios';
import LabelCreationWindow from './LabelCreationWindow';
import { API_URL, getApiErrorMessage } from '../api';
//import ReviewModal from './ReviewModal';

const Review = ({ sessionId, labels, setLabels, setResults, dataset, setDataset, claudeData, onAdvanceStage, projectMetadata }) => {
    const [currentThemeIndex, setCurrentThemeIndex] = useState(0);
    const [responseActions, setResponseActions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [rejectedEntries, setRejectedEntries] = useState([]);
    const [showEditLabels, setShowEditLabels] = useState(false);
    const [unclassifiedSelections, setUnclassifiedSelections] = useState({});
    const [suggestedThemes, setSuggestedThemes] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [tempUncCat, setTempUncCat] = useState({});
    const [aiLoading, setAiLoading] = useState(false);
    const [allThemes, setAllThemes] = useState([...labels])
    

    const unclassifiedTheme = {
        name: "Unclassified",
        description: "Responses that don't fit any other theme",
        color: "#cccccc"
    };
    
    const hasUnclassifiedTheme = labels.some(label => label.name === "Unclassified");
    //let allThemes = hasUnclassifiedTheme ? labels : [...labels];
    const currentTheme = allThemes[currentThemeIndex] || { name: "None", color: "#cccccc" };
    let themeResponses = claudeData?.[currentTheme.name] || [];
    
    useEffect(() => {
        
        
        //console.log(dataset)
        
        if (!hasUnclassifiedTheme && claudeData && !claudeData["Unclassified"]) {
            const updatedClaudeData = {...claudeData};
            updatedClaudeData["Unclassified"] = [];
            if (typeof claudeData === 'object') {
                Object.assign(claudeData, updatedClaudeData);
            }
        }
    }, [claudeData, hasUnclassifiedTheme]);
    
    useEffect(() => {
        if (currentTheme && !responseActions[currentTheme.name]) {
            setResponseActions(prev => ({
                ...prev,
                [currentTheme.name]: Array(themeResponses.length).fill(null)
            }));
        }
    }, [currentTheme, themeResponses, responseActions]);

    const handleAction = (index, action) => {
        const updatedActions = [...(responseActions[currentTheme.name] || [])];
        updatedActions[index] = action;
        
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: updatedActions
        }));
    };

    



    const handleUndo = (index) => {
        const updatedActions = [...(responseActions[currentTheme.name] || [])];
        updatedActions[index] = null;
        
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: updatedActions
        }));
    };

    const handleAcceptAll = () => {
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: Array(themeResponses.length).fill('approve')
        }));
    };

    const handleRejectAll = () => {
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: Array(themeResponses.length).fill('deny')
        }));
    };


    const handleNextTheme = () => {
        const rejectedIndices = (responseActions[currentTheme.name] || [])
            .map((action, idx) => (action === 'deny' ? themeResponses[idx] : null))
            .filter(index => index !== null);

        if (rejectedIndices.length > 0) {
            setRejectedEntries(rejectedIndices);
            setShowReassignModal(true);
        } else if (currentThemeIndex < allThemes.length - 1) {

            setCurrentThemeIndex(currentThemeIndex + 1);
            //testing
            //if (allThemes[currentThemeIndex] == "Unclassified"){

            //}
            //testing
        } else {
            handleSubmitFinalDataset();
        }
    };

    const handleGetSuggestedThemes = async () => {
        setLoadingSuggestions(true);
        setError(null);
        
        try {
            if (showSuggestions) {
                setSuggestedThemes([]);
            }
            const responses = themeResponses.map(idx => dataset[idx]?.original || "Response not found").join('\n');
            const response = await axios.post(`${API_URL}/session/${sessionId}/suggest-themes`, {
                response: responses,
                specBool: 'true',
                apiKey: projectMetadata.apiKey
            });

            if (response.data && response.data.suggested_themes) {
                setSuggestedThemes(response.data.suggested_themes);
                if (!showSuggestions) {
                    setShowSuggestions(true);
                }
            } else {
                setError("No themes could be generated. Please check data or try again.");
            }
        } catch (error) {
            console.error("Error getting suggested themes:", error.response?.data || error.message);
            setError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleFinishReassignment = () => {
        rejectedEntries.forEach((rejectedIndex) => {
            const currentThemeResponses = claudeData[currentTheme.name];
            if (currentThemeResponses) {
                claudeData[currentTheme.name] = currentThemeResponses.filter(
                    (responseIndex) => responseIndex !== rejectedIndex
                );
            }

            const isInOtherThemes = Object.keys(claudeData).some((themeName) => {
                if (themeName !== currentTheme.name) {
                    return claudeData[themeName]?.includes(rejectedIndex);
                }
                return false;
            });

            if (!isInOtherThemes) {
                if (!claudeData["Unclassified"]) {
                    claudeData["Unclassified"] = [];
                }
                if (!claudeData["Unclassified"].includes(rejectedIndex)) {
                    claudeData["Unclassified"].push(rejectedIndex);
                }
            }
        });

        setShowReassignModal(false);

        if (currentThemeIndex >= allThemes.length - 1) {
            handleSubmitFinalDataset();
        } else {
            setCurrentThemeIndex(currentThemeIndex + 1);
        }
    };

    const addThemeToCode = (theme, responseIndex) => {
        const selectedTheme = theme;
        //console.log("selectedThemeObj:", selectedTheme);
        if (selectedTheme && selectedTheme!=="Unclassified" && !claudeData[selectedTheme].includes(responseIndex)) {
            const selectedThemeObj = allThemes.find(tema => tema.name === theme);
            console.log("selectedThemeObj:", selectedThemeObj);

            if (selectedThemeObj) {
                // Add the response to the selected theme
                //const responseIndex = themeResponses[idx];
                // Initialize claudeData for new theme if needed
                if (!claudeData[selectedTheme]) {
                    claudeData[selectedTheme] = [];
                }
                // Add response to selected theme if not already there
                if (!claudeData[selectedTheme].includes(responseIndex)) {
                    claudeData[selectedTheme].push(responseIndex);
                }
                if (!dataset[responseIndex].themes.includes(responseIndex)) {
                    dataset[responseIndex].themes.push({
                        name: selectedThemeObj.name,
                        color: selectedThemeObj.color,
                        description: selectedThemeObj.description || ""
                    });
                }
                
                console.log('test');
                console.log(dataset[responseIndex].themes);
                // Remove from unclassified
                //claudeData["Unclassified"] = claudeData["Unclassified"].filter(
                //    index => index !== responseIndex
                //);
                
                //console.log(labels);
                
                // Initialize and update response actions
                setResponseActions(prev => {
                    const updated = { ...prev };
                    if (!updated[selectedTheme]) {
                        updated[selectedTheme] = Array(claudeData[selectedTheme].length).fill(null);
                    }
                    // Mark as approved in the selected theme
                    const newIndex = claudeData[selectedTheme].length - 1;
                    updated[selectedTheme][newIndex] = 'approve';
                    return updated;
                });
            }
        }
    }

    const removeThemeFromCode = (theme, responseIndex) => {
        console.log('juanpabloraba', theme)
        const selectedTheme = theme;
        //console.log("selectedThemeObj:", selectedTheme);
        if (selectedTheme && selectedTheme!=="Unclassified") { //&& claudeData[selectedTheme].includes(responseIndex)) {
            console.log('broken')
            const selectedThemeObj = allThemes.find(tema => tema.name === theme);
            console.log("selectedThemeObj:", selectedThemeObj);

            if (selectedThemeObj) {
                // Add the response to the selected theme
                //const responseIndex = themeResponses[idx];
                // Initialize claudeData for new theme if needed
                //if (claudeData[selectedTheme]) {
                //    claudeData[selectedTheme] = [];
                //}
                // Add response to selected theme if not already there
                if (claudeData[selectedTheme].includes(responseIndex)) {
                    let ind = claudeData[selectedTheme].indexOf(responseIndex);
                    //claudeData[selectedTheme].push(responseIndex);
                    claudeData[selectedTheme].splice(ind, 1);
                }
                //if (dataset[responseIndex].themes.includes(responseIndex)) {
                    {/*dataset[responseIndex].themes.push({
                        name: selectedThemeObj.name,
                        color: selectedThemeObj.color,
                        description: selectedThemeObj.description || ""
                    });*/}
                    let ind = dataset[responseIndex].themes.find((tema) => tema.name !== selectedThemeObj.name);
                    console.log('ind', ind)
                    dataset[responseIndex].themes.splice(ind, 1);
                //}
                
                console.log('test');
                console.log(dataset[responseIndex].themes);
                // Remove from unclassified
                //claudeData["Unclassified"] = claudeData["Unclassified"].filter(
                //    index => index !== responseIndex
                //);
                
                //console.log(labels);
                
                // Initialize and update response actions
                setResponseActions(prev => {
                    const updated = { ...prev };
                    if (!updated[selectedTheme]) {
                        updated[selectedTheme] = Array(claudeData[selectedTheme].length).fill(null);
                    }
                    // Mark as approved in the selected theme
                    const newIndex = claudeData[selectedTheme].length - 1;
                    updated[selectedTheme][newIndex] = 'approve';
                    return updated;
                });
            }
        }
    }

    const queryAI = async () => {
        let sent = themeResponses.map((responseIndex, idx) => {
            return dataset[responseIndex]?.original;
        })
        console.log('send', sent)
        setAiLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_URL}/session/${sessionId}/submit-manual-coding`, {
                labels: allThemes,
                response: sent,
                specBool: 'true',
                apiKey: projectMetadata.apiKey
            });

            const dataReturned = response.data.claude_data;
            console.log(dataReturned);

            Object.keys(dataReturned).forEach(key => {
                for (var x=0; x<dataReturned[key].length; x++){
                    console.log(key, dataset[themeResponses[dataReturned[key][x]]].original)
                    addThemeToCode(key, themeResponses[dataReturned[key][x]])
                }
            });
        } catch (error) {
            console.error("Error querying AI:", error.response?.data || error.message);
            setError(getApiErrorMessage(error, "We couldn't classify these responses."));
        } finally {
            setAiLoading(false);
        }
    }
    
    const addTheme = (theme) => {
        // Add to labels state
        
        setAllThemes([...allThemes, theme]);

        // Initialize empty array for new theme in claudeData
        if (!claudeData[theme.name]) {
            claudeData[theme.name] = [];
        }

        // Initialize response actions for new theme
        setResponseActions(prev => ({
            ...prev,
            [theme.name]: []  // Empty array since no responses are classified yet
        }));

        // Update dataset entries to include the new theme structure if needed
        setDataset(prevDataset => 
            prevDataset.map(entry => ({
                ...entry,
                themes: entry.themes || []  // Ensure themes array exists
            }))
        );
    };

    const handleSubmitFinalDataset = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const updatedDataset = [...dataset];

            Object.keys(responseActions).forEach(themeName => {
                const themeActions = responseActions[themeName];
                const themeResponseIndices = claudeData[themeName] || [];

                themeActions.forEach((action, idx) => {
                    if (action === 'approve' || themeName === "Unclassified") {
                        const responseIndex = themeResponseIndices[idx];
                        if (responseIndex !== undefined && responseIndex < updatedDataset.length) {
                            const theme = allThemes.find(label => label.name === themeName);

                            if (theme) {
                                if (!updatedDataset[responseIndex].themes) {
                                    updatedDataset[responseIndex].themes = [];
                                }

                                const themeExists = updatedDataset[responseIndex].themes.some(
                                    t => t.name === theme.name
                                );

                                if (!themeExists) {
                                    if (updatedDataset[responseIndex].themes.length > 1 && themeName !== "Unclassified"){
                                        updatedDataset[responseIndex].themes.push({
                                            name: theme.name,
                                            color: theme.color,
                                            description: theme.description || ""
                                        });
                                    } else if (updatedDataset[responseIndex].themes.length === 0) {
                                        updatedDataset[responseIndex].themes.push({
                                            name: theme.name,
                                            color: theme.color,
                                            description: theme.description || ""
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
            });

            setDataset(updatedDataset);

            const response = await axios.post(
                `${API_URL}/session/${sessionId}/submit-final-dataset`,
                { 
                    dataset: updatedDataset,
                    labels: allThemes,
                    apiKey: projectMetadata.apiKey
                }
            );

            if (response.status === 200) {
                setResults(response.data.themes);
                onAdvanceStage();
            } else {
                setError('Error submitting final dataset: ' + (response.data.error || 'Unknown error'));
            }
        } catch (error) {
            setError(getApiErrorMessage(error, "We couldn't submit the final dataset."));
        } finally {
            setIsLoading(false);
        }
    };
    
    const currentActions = responseActions[currentTheme.name] || Array(themeResponses.length).fill(null);
    const allActionsCompleted = currentTheme.name === "Unclassified" || currentActions.every(action => action !== null);
    
    const totalThemes = allThemes.length;
    const completedThemes = Object.keys(responseActions).filter(theme => {
        const actions = responseActions[theme];
        return actions && actions.every(action => action !== null);
    }).length;
    
    const progressPercentage =  isLoading ? 100 : ( currentTheme.name === "Unclassified" 
        ? (allThemes.filter(theme => theme.name !== "Unclassified").length / allThemes.length) * 100
        : totalThemes > 0 
            ? (completedThemes / totalThemes) * 100 
            : 0);
    const formattedThemeName = `${currentTheme.name} (${themeResponses.length} responses)`;

    return (
        <Container fluid className="d-flex justify-content-center align-items-start p-0" style={{ padding: '0', height: '90vh' }}>
            <Row className="h-100 m-0 w-100 gap-3">
                <Col xs={3} className="p-2 bg-light h-100">
                    <Card className="mb-2" style={{ height: '20%' }}>
                        <Card.Body className="rounded d-flex flex-column">
                            <h5>Theme Review</h5><hr style={{ margin: '0px' }}/>
                            <p className="text-muted">
                                Review the AI-generated classifications by theme. Approve or reject each classification.
                            </p>
                            {error && <Alert variant="danger">{error}</Alert>}
                        </Card.Body>
                    </Card>
                    <Card className="mb-2" style={{ height: '28%' }}>
                        <Card.Body className="rounded d-flex flex-column">
                            <strong>Current Theme</strong><hr style={{ marginTop: '3px' }}/>
                            <div className="d-flex align-items-center mb-2">
                                <div 
                                    style={{ 
                                        width: '20px', 
                                        height: '20px', 
                                        borderRadius: '50%', 
                                        backgroundColor: currentTheme.color,
                                        marginRight: '10px'
                                    }}
                                ></div>
                                <h5 className="mb-0">{currentTheme.name}</h5>
                            </div>
                            <div style={{ overflowY: 'auto', maxHeight: '110px' }}>
                                <p>{currentTheme.description || "No description available"} </p>
                            </div>
                            
                        </Card.Body>
                    </Card>
                    <Card className="flex-grow-1" style={{height: '50%' }}>
                        <Card.Body className="rounded d-flex flex-column">
                            <strong>Progress</strong><hr/>
                            
                            <p className="text-muted">
                                Reviewing theme {currentThemeIndex + 1} of {totalThemes}
                            </p>
                            <p>
                                <strong>Theme List:</strong>
                            </p>
                            <div style={{ overflowY: 'auto', maxHeight: '235px' }}>
                                {allThemes.map((label, index) => {
                                    const isComplete = responseActions[label.name] && 
                                        responseActions[label.name].every(action => action !== null);
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className="d-flex align-items-center mb-2"
                                            style={{ opacity: index === currentThemeIndex ? 1 : 0.7 }}
                                        >
                                            <div 
                                                style={{ 
                                                    width: '12px', 
                                                    height: '12px', 
                                                    borderRadius: '50%', 
                                                    backgroundColor: isComplete ? '#28a745' : '#6c757d',
                                                    marginRight: '10px'
                                                }}
                                            ></div>
                                            <span>
                                                {label.name}
                                                {index === currentThemeIndex && ' (current)'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                <Col xs={8} className="p-2 h-100 d-flex bg-light flex-column">
                    <Card className="flex-grow-1">
                        <Card.Header className="d-flex flex-column align-items-center">
                            <div className="d-flex justify-content-between w-100 mt-2 align-items-center">
                                <h5>
                                    {formattedThemeName}
                                </h5>
                                <div className="d-flex align-items-center">
                                {currentTheme.name === "Unclassified" && (<Button 
                                variant="primary" 
                                onClick={() => queryAI()}
                                style={{ marginRight: '10px' }}
                                >
                                    
                                    {aiLoading ? (
                                        <>
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Reassigning...
                                        </>
                                    ) : (
                                        'Reassign'
                                    )}
                                    
                                </Button>)}
                                <Button 
                                    variant="primary" 
                                    onClick={() => setShowEditLabels(true)}
                                    style={{ marginRight: '10px' }}
                                >
                                    
                                    Edit Themes
                                    
                                </Button>
                                <Button 
                                    variant="primary" 
                                    onClick={handleNextTheme} 
                                    disabled={(!allActionsCompleted || isLoading)}
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Processing...
                                        </>
                                    ) : (
                                        currentThemeIndex >= allThemes.length - 1 ? 'Finish' : 'Next Theme'
                                    )}
                                </Button>
                                </div>
                            </div>
                        </Card.Header>
                        
                        <div className="px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                            <ProgressBar 
                                now={progressPercentage} 
                                label={`${Math.round(progressPercentage)}%`}
                                variant="info" 
                                className="mb-0" // Remove margin below if vertically aligned
                                style={{ width: '60%' }} // Optional: limit width so buttons fit well
                            />
                            <div className="d-flex">
                                <Button 
                                    className="me-2" 
                                    variant="success" 
                                    size="sm" 
                                    onClick={handleAcceptAll} 
                                    disabled={currentTheme.name === "Unclassified"}
                                >
                                    Accept All
                                </Button>
                                <Button 
                                    variant="danger" 
                                    size="sm" 
                                    onClick={handleRejectAll} 
                                    disabled={currentTheme.name === "Unclassified"}
                                >
                                    Reject All
                                </Button>
                            </div>
                        </div>
                        <Card.Body style={{ height: '1px' }}>
                            <div 
                                style={{ overflowY: 'auto', width: '100%', padding: '10px', height: '100%' }}
                                className="bg-light border rounded"
                            >
                               
                                {themeResponses.length > 0 ? (
                                    themeResponses.map((responseIndex, idx) => {
                                        const responseText = responseIndex < dataset.length ? 
                                            dataset[responseIndex].original : 
                                            "Response not found";
                                            {/*border-bottom*/}
                                        return (
                                            <div 
                                                key={`${currentTheme.name}-${idx}`} 
                                                className={`p-2 d-flex justify-content-between align-items-center`}
                                                style={{ 
                                                    textAlign: 'left', 
                                                    backgroundColor: currentActions[idx] === 'approve' ? 
                                                        '#d4edda' : currentActions[idx] === 'deny' ? 
                                                        '#f8d7da' : 'transparent',
                                                    marginBottom: `${30*dataset[responseIndex].themes.length}`,
                                                    

                                                }}
                                            >
                                                <span>
                                                    {responseText}
                                                </span>
                                                <div 
                                                    className="d-flex flex-column" 
                                                    style={{ 
                                                        height: '60px', 
                                                        justifyContent: currentActions[idx] === null ? 
                                                            'space-between' : 'center' 
                                                    }}
                                                >
                                                    {currentActions[idx] === null && currentTheme.name !== "Unclassified" && (
                                                        <>
                                                            <Button 
                                                                variant="success" 
                                                                className="d-flex align-items-center" 
                                                                size="sm"
                                                                onClick={() => handleAction(idx, 'approve')}
                                                            >
                                                                <FaCheck/>
                                                            </Button>
                                                            <Button 
                                                                variant="danger" 
                                                                className="d-flex align-items-center" 
                                                                size="sm"
                                                                onClick={() => handleAction(idx, 'deny')}
                                                            >
                                                                <FaTimes/>
                                                            </Button>
                                                        </>
                                                    )}
                                                    {currentActions[idx] !== null && currentTheme.name !== "Unclassified" && (
                                                        <Button 
                                                            variant="secondary" 
                                                            className="d-flex align-items-center" 
                                                            size="sm"
                                                            onClick={() => handleUndo(idx)}
                                                        >
                                                            <FaUndo/>
                                                        </Button>
                                                    )}
                                                    {currentTheme.name === "Unclassified" && (
                                                        <Form.Group controlId={`formThemes-${idx}`} style={{ 
                                                    maxWidth: '150px'
                                                    

                                                }}>
                                                            <Form.Control
                                                                type="text"
                                                                id={`formThemes-${idx}`}
                                                                placeholder="Select a theme..."
                                                                list={`theme-options-${idx}`}
                                                                className="mt-2"
                                                                onChange={(e) => {
                                                                    const selectedTheme = e.target.value;
                                                                    addThemeToCode(selectedTheme, responseIndex);
                                                                    /*if (selectedTheme && selectedTheme !== "Unclassified" && !claudeData[selectedTheme].includes(responseIndex)) {
                                                                        const selectedThemeObj = allThemes.find(theme => theme.name === selectedTheme);

                                                                        if (selectedThemeObj) {
                                                                            console.log(themeResponses);
                                                                            // Add the response to the selected theme
                                                                            const responseIndex = themeResponses[idx];
                                                                            // Initialize claudeData for new theme if needed
                                                                            if (!claudeData[selectedTheme]) {
                                                                                claudeData[selectedTheme] = [];
                                                                            }
                                                                            // Add response to selected theme if not already there
                                                                            if (!claudeData[selectedTheme].includes(responseIndex)) {
                                                                                claudeData[selectedTheme].push(responseIndex);
                                                                            }
                                                                            if (!dataset[responseIndex].themes.includes(responseIndex)) {
                                                                                dataset[responseIndex].themes.push({
                                                                                    name: selectedThemeObj.name,
                                                                                    color: selectedThemeObj.color,
                                                                                    description: selectedThemeObj.description || ""
                                                                                });
                                                                            }
                                                                            
                                                                            

                                                                            // Remove from unclassified
                                                                            //claudeData["Unclassified"] = claudeData["Unclassified"].filter(
                                                                            //    index => index !== responseIndex
                                                                            //);
                                                                            console.log(dataset[responseIndex].themes);
                                                                            
                                                                            //console.log(labels);
                                                                            
                                                                            // Initialize and update response actions
                                                                            setResponseActions(prev => {
                                                                                const updated = { ...prev };
                                                                                if (!updated[selectedTheme]) {
                                                                                    updated[selectedTheme] = Array(claudeData[selectedTheme].length).fill(null);
                                                                                }
                                                                                // Mark as approved in the selected theme
                                                                                const newIndex = claudeData[selectedTheme].length - 1;
                                                                                updated[selectedTheme][newIndex] = 'approve';
                                                                                return updated;
                                                                            });

                                                                            
                                                                            // Clear the input
                                                                            e.target.value = "";
                                                                        }
                                                                    }*/
                                                                    e.target.value = "";
                                                                }}
                                                            />
                                                            <datalist id={`theme-options-${idx}`}>
                                                                {allThemes.filter(theme => theme.name !== "Unclassified").map((theme, index) => (
                                                                    <option key={index} value={theme.name}>
                                                                        {theme.name}
                                                                    </option>
                                                                ))}
                                                            </datalist>
                                                            {dataset[responseIndex].themes.map((theme, i) => {
                                                                console.log(theme.color);
                                                                var calor = theme.color === undefined ? '000000': theme.color

                                                                    return (
                                                                        <div key={i} >
                                                                            <Badge 
                                                                                bg="light" 
                                                                                text="dark" 
                                                                                style={{ 
                                                                                    
                                                                                    marginRight: '5px',
                                                                                    marginTop: '0px',
                                                                                    
                                                                                }}
                                                                                onClick={() => removeThemeFromCode(theme.name, responseIndex)}
                                                                            >
                                                                                <p style={{
                                                                                    backgroundColor: calor,
                                                                                    padding: '4px',
                                                                                    margin: '0px',
                                                                                    
                                                                                    color: '#FFFFFF',
                                                                                    borderRadius: '5px'
                                                                                }}>{theme.name}</p>
                                                                            </Badge>
                                                                        </div>
                                                                    );

                                                                })
                                                            }
                                                        </Form.Group>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-muted text-center my-4">
                                        No responses were classified with this theme.
                                    </p>
                                )}
                            </div>
                            
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Modal 
                show={showReassignModal} 
                onHide={() => setShowReassignModal(false)}
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>Rejected Classifications</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        You've rejected {rejectedEntries.length} classifications for the theme "{currentTheme.name}".
                        Rejected items will move to the "Unclassified" category if they have no other assignments.
                    </p>
                    <p>
                        Continue to {currentThemeIndex >= allThemes.length - 1 ? 'finish the review' : 'the next theme'}?
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowReassignModal(false)}>
                        Go Back
                    </Button>
                    <Button variant="primary" onClick={handleFinishReassignment}>
                        {currentThemeIndex >= allThemes.length - 1 ? 'Finish Review' : 'Next Theme'}
                    </Button>
                </Modal.Footer>
            </Modal>
            {/*EDIT LABELS*/}
            <Modal 
                show={showEditLabels} 
                onHide={() => setShowEditLabels(false)}
                centered
                size="lg"
            >
                <Modal.Header closeButton>
                <Modal.Title>Add Themes</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <Row>
                    <Tab.Container id="left-tabs-example" defaultActiveKey="first">
                    
                        <Col sm={3}>
                        <Nav variant="pills" className="flex-column">
                            <Nav.Item>
                            <Nav.Link eventKey="first">Cur. Themes</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                            <Nav.Link eventKey="second">Add Theme</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                            <Nav.Link eventKey="third">LLM Process</Nav.Link>
                            </Nav.Item>
                        </Nav>
                        </Col>
                        <Col sm={9}>
                        <Tab.Content>
                            <Tab.Pane eventKey="first">
                                {allThemes.map((label, index) => {
                                    //console.log(label);
                                    const isComplete = responseActions[label.name] && 
                                        responseActions[label.name].every(action => action !== null);
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className=" align-items-center mb-2"
                                            style={{ opacity: index === currentThemeIndex ? 1 : 0.7 }}
                                        >
                                            <div 
                                                
                                            ></div>
                                            <span style={{ 
                                                    borderRadius: '10px',
                                                    padding: '5px', 
                                                    color: '#fff',
                                                    backgroundColor: label.color,
                                                    
                                                }}>
                                                {label.name}
                                            </span>
                                            <p style={{
                                                marginTop: '5px',
                                                marginLeft: '15px'
                                            }}>{label.description}</p>
                                        </div>
                                    );
                                })}

                            </Tab.Pane>
                            <Tab.Pane eventKey="second">
                                <LabelCreationWindow labels={allThemes || []} setLabels={addTheme} deleteLabels={setLabels} />
                            </Tab.Pane>
                            <Tab.Pane eventKey="third">
                                
                                <div className="d-flex justify-content-between mb-3">
                                <span>
                                    {suggestedThemes.length > 0 ? 
                                        `Found ${suggestedThemes.length} theme suggestions` : 
                                        "Generate themes"}
                                </span>
                                <Button 
                                    variant="outline-primary" 
                                    size="sm" 
                                    onClick={handleGetSuggestedThemes}
                                    disabled={loadingSuggestions || !sessionId || dataset?.length === 0}
                                >
                                    {loadingSuggestions ? (
                                        <>
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Refreshing...
                                        </>
                                    ) : (
                                        'Refresh Suggestions'
                                    )}
                                </Button>
                            </div>
                            
                            {loadingSuggestions ? (
                                <div className="text-center py-4">
                                    <Spinner animation="border" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </Spinner>
                                    <p className="mt-2">Analyzing your responses to generate theme suggestions...</p>
                                </div>
                            ) : suggestedThemes.length > 0 ? (
                                <ListGroup>
                                    {suggestedThemes.map((theme, index) => {
                                        const alreadyAdded = allThemes.some(l => l.name === theme.name);
                                        return (
                                            <ListGroup.Item 
                                                key={index}
                                                className={`d-flex justify-content-between align-items-center ${alreadyAdded ? 'bg-light' : ''}`}
                                            >
                                                <div>
                                                    <h5>{theme.name} {alreadyAdded}</h5>
                                                    <p className="text-muted mb-0">{theme.description}</p>
                                                </div>
                                                <Button 
                                                    variant={alreadyAdded ? "outline-secondary" : "outline-primary"}
                                                    onClick={() => {addTheme(theme);}}
                                                    disabled={alreadyAdded}
                                                    style={{ minWidth: '110px' }}
                                                >
                                                    {alreadyAdded ? 'Added' : 'Add Theme'}
                                                </Button>
                                            </ListGroup.Item>
                                        );
                                    })}
                                </ListGroup>
                            ) : (
                                <p className="text-center text-muted">Click "Refresh Suggestions" to generate new themes.</p>
                            )}

                            </Tab.Pane>
                        </Tab.Content>
                        </Col>
                    
                    </Tab.Container>
                
                </Row>
                </Modal.Body>

                <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowEditLabels(false)}>Close</Button>
                {/*<Button variant="primary">Save changes</Button>*/}
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default Review;
