import React, { useEffect, useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

const DEFAULT_THEME_COLOR = '#315f9f';
const THEME_COLORS = ['#315f9f', '#2f7d68', '#a65c37', '#7a5c99', '#3f7d9d', '#8a6a2f', '#556b5d', '#9a4f61'];

const LabelCreationWindow = ({ labels = [], setLabels, deleteLabels, buttonBool=true }) => {
    const [newLabel, setNewLabel] = useState('');
    const [labelDescription, setLabelDescription] = useState('');
    const [selectedColor, setSelectedColor] = useState(DEFAULT_THEME_COLOR);
    const [show, setShow] = useState(false);
    const [editIndex, setEditIndex] = useState(null);
    const [formMode, setFormMode] = useState('add');

    const toggleShow = () => setShow(!show);

    

    const renderTooltip = (props) => (
        <Tooltip id="button-tooltip" {...props}>
        CSV files must have a row for every theme, consisting of a theme name and a description in two columns. TXT files can be seperated by commas and newlines to replicate this.
        </Tooltip>
    );
 
    const addLabel = () => {
        if (newLabel.trim() === '' || 
            labels.some(label => label.name.toLowerCase() === newLabel.toLowerCase()) || 
            labels.length >= 10) return;

        setLabels({ 
            name: newLabel, 
            description: labelDescription, 
            color: selectedColor 
        });
        
        setNewLabel('');
        setLabelDescription('');
        setSelectedColor(DEFAULT_THEME_COLOR);
    };

    const startEditLabel = (index) => {
        const label = labels[index];
        setNewLabel(label.name);
        setLabelDescription(label.description || '');
        setSelectedColor(label.color);
        setEditIndex(index);
        setFormMode('edit');
    };

    const updateLabel = () => {
        if (editIndex === null || newLabel.trim() === '') return;
        
        if (labels.some((label, idx) => 
            idx !== editIndex && 
            label.name.toLowerCase() === newLabel.toLowerCase()
        )) return;

        const updatedLabels = [...labels];
        updatedLabels[editIndex] = {
            name: newLabel,
            description: labelDescription,
            color: selectedColor
        };
        
        setLabels(updatedLabels);
        
        setNewLabel('');
        setLabelDescription('');
        setSelectedColor(DEFAULT_THEME_COLOR);
        setEditIndex(null);
        setFormMode('add');
    };

    const cancelEdit = () => {
        setNewLabel('');
        setLabelDescription('');
        setSelectedColor(DEFAULT_THEME_COLOR);
        setEditIndex(null);
        setFormMode('add');
    };

    const deleteLabel = (index) => {
        deleteLabels(labels.filter((_, idx) => idx !== index));
       
        if (editIndex === index) {
            cancelEdit();
        }
    };

    const fileLabel = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = (e) => {
            const text = e.target.result;
            const rows = text.split('\n');
            const newLabels = [...labels]; // Create a copy of current labels

            rows.forEach(row => {
                const firstCommaIndex = row.indexOf(',');
                if (firstCommaIndex === -1) return;

                const name = row.substring(0, firstCommaIndex).trim();
                const description = row.substring(firstCommaIndex + 1).trim();
                
                if (name && name !== '') {
                    const existingLabelIndex = labels.findIndex(
                        label => label.name.toLowerCase() === name.toLowerCase()
                    );

                    if (existingLabelIndex === -1 && newLabels.length < 10) {
                        // Name doesn't exist, add new label
                        const color = THEME_COLORS[newLabels.length % THEME_COLORS.length];
                        newLabels.push({ 
                            name, 
                            description: description || "",
                            color 
                        });
                    } else if (existingLabelIndex !== -1 && 
                             labels[existingLabelIndex].description !== description) {
                        // Name exists but description is different, update description
                        newLabels[existingLabelIndex] = {
                            ...newLabels[existingLabelIndex],
                            description: description || ""
                        };
                    }
                }
            });

            setLabels(newLabels);
        };
            {/*const newLabels = [];

            rows.forEach(row => {
                const [name, description] = row.split(',').map(item => item.trim());
                
                if (name && 
                    !(name.trim() === '' || 
                    labels.some(label => label.name.toLowerCase() === name.toLowerCase()) || 
                    (labels.length + newLabels.length >= 10))) {
                    
                    const color = '#'+(Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0');
                    
                    newLabels.push({ 
                        name, 
                        description: description || "",
                        color 
                    });
                }
            });

            setLabels(prevLabels => [...prevLabels, ...newLabels]);
        };*/}
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (formMode === 'add') {
            addLabel();
        } else {
            updateLabel();
        }
    };

    return (
        <>
            
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Label>Theme name</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Enter theme name"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                maxLength={30}
                            />
                        </Form.Group>
                        
                        <Form.Group className="mb-3">
                            <Form.Label>Description</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={2}
                                placeholder="Enter theme description"
                                value={labelDescription}
                                onChange={(e) => setLabelDescription(e.target.value)}
                                maxLength={200}
                            />
                        </Form.Group>
                        
                        <div className="theme-editor-actions">
                            <Form.Label>Theme color</Form.Label>
                            <Form.Control
                                type="color"
                                value={selectedColor}
                                onChange={(e) => setSelectedColor(e.target.value)}
                                className="form-control-color m-2"
                            />

                            {formMode === 'add' ? (
                                <Button 
                                    variant="primary"
                                    onClick={addLabel}
                                    disabled={!newLabel.trim() || labels.length >= 10}
                                    className="theme-editor-actions__submit"
                                >
                                    Add theme
                                </Button>
                            ) : (
                                <div className="theme-editor-actions__buttons">
                                    <Button 
                                        variant="primary" 
                                        onClick={updateLabel}
                                        className="me-2"
                                        disabled={!newLabel.trim()}
                                    >
                                        Update
                                    </Button>
                                    <Button variant="secondary" onClick={cancelEdit}>
                                        Cancel
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Form>
                    
                    <hr />
                    
                    <div className="theme-manager-header">
                        <h5 className="mb-0">Current themes ({labels.length}/10)</h5>
                        <Form.Group controlId="formFile" className="theme-manager-import">
                            <Form.Control 
                                type="file" 
                                accept=".txt,.csv" 
                                onChange={fileLabel}
                                disabled={labels.length >= 10}
                                size="sm"
                            />
                            <Form.Text className="text-muted">
                                Import themes from CSV or TXT
                            </Form.Text>
                            <OverlayTrigger
                            placement="right"
                            delay={{ show: 250, hide: 400 }}
                            overlay={renderTooltip}
                            >
                                <svg style={{margin: '2px'}} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-question-circle" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                                    <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94"/>
                                </svg>
                            </OverlayTrigger>
                        </Form.Group>
                    </div>
                    
                    <ListGroup>
                        {labels.length === 0 ? (
                            <p className="text-muted text-center py-3">
                                No themes defined yet. Add your first theme above.
                            </p>
                        ) : (
                            labels.map((label, index) => (
                                <ListGroup.Item key={index} className="theme-manager-item">
                                    <div className="theme-manager-item__copy">
                                        <div 
                                            style={{ 
                                                backgroundColor: label.color, 
                                                width: '20px', 
                                                height: '20px', 
                                                borderRadius: '50%', 
                                                display: 'inline-block',
                                                marginRight: '10px'
                                            }}
                                        ></div>
                                        <div>
                                            <div><strong>{label.name}</strong></div>
                                            {label.description && (
                                                <small className="text-muted">{label.description}</small>
                                            )}
                                        </div>
                                    </div>
                                    <div className="theme-manager-item__actions">
                                        <Button 
                                            variant="outline-secondary" 
                                            size="sm" 
                                            className="me-2"
                                            onClick={() => startEditLabel(index)}
                                        >
                                            Edit
                                        </Button>
                                        <Button 
                                            variant="outline-danger" 
                                            size="sm" 
                                            onClick={() => deleteLabel(index)}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </ListGroup.Item>
                            ))
                        )}
                    </ListGroup>

                
        </>
    );
};
export default LabelCreationWindow;
