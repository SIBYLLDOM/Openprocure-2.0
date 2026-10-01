import React from 'react';
import { X, Wand2, Sparkles } from 'lucide-react';

const GenerateTasksModal = ({ isOpen, onClose, onGenerate, isGenerating }) => {
    if (!isOpen) return null;

    const handleSubmit = () => {
        onGenerate();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', width: '450px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: '#1f2937' }}>
                        <Wand2 size={24} color="#7c3aed" /> Generate Tasks
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
                </div>

                <div style={{ background: '#f3e8ff', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e9d5ff', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <Sparkles size={24} color="#9333ea" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, color: '#6b21a8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        Ready to let AI do the heavy lifting?
                        <br /><br />
                        We will securely stream this tender's details directly into the <strong>gpt-oss:120b-cloud</strong> model. It will analyze the technical specifications and automatically dispatch a practical, timeline-driven schedule of tasks directly to your connected departments.
                    </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                        onClick={onClose}
                        disabled={isGenerating}
                        style={{ padding: '0.65rem 1.25rem', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, color: '#374151' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isGenerating}
                        style={{
                            padding: '0.65rem 1.5rem',
                            background: isGenerating ? '#a78bfa' : '#7c3aed',
                            color: 'white', border: 'none', borderRadius: '6px', cursor: isGenerating ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600,
                            transition: 'background 0.2s',
                            boxShadow: '0 2px 4px rgba(124,58,237,0.3)'
                        }}
                    >
                        {isGenerating ? 'Analyzing System...' : <><Wand2 size={18} /> Initialize AI Scan</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GenerateTasksModal;
