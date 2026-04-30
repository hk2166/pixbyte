// FeedbackModal.tsx — User feedback form that appears after 2 minutes
import { useState, type FormEvent } from 'react';
import { submitFeedback } from '../api';

interface Props {
  onClose: () => void;
  onSubmit: () => void;
}

export default function FeedbackModal({ onClose, onSubmit }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    building: '',
    improvements: '',
    features: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!formData.improvements.trim() && !formData.features.trim()) {
      setError('Please provide at least one suggestion or feature request');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await submitFeedback({
        name: formData.name.trim(),
        building: formData.building.trim() || 'Not specified',
        improvements: formData.improvements.trim() || 'None',
        features: formData.features.trim() || 'None'
      });
      
      setSubmitted(true);
      setTimeout(() => {
        onSubmit();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback. Please try again.');
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (submitted) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: 'var(--green)', fontSize: 20, marginBottom: 12 }}>
              Thank You!
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
              Your feedback helps us make this tool better for everyone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleSkip}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <span className="label-cyan">// WE'D LOVE YOUR FEEDBACK</span>
          <button className="modal-close" onClick={handleSkip}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gap: 20 }}>
            <div style={{ 
              padding: '12px 16px', 
              background: 'var(--cyan-faint)', 
              border: '1px solid var(--cyan-dim)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              color: 'var(--text)',
              lineHeight: 1.6
            }}>
              <strong style={{ color: 'var(--cyan)' }}>👋 Hey there!</strong> You've been using our tool for a bit. 
              We'd love to hear your thoughts to make it even better!
            </div>

            {error && (
              <div style={{ 
                padding: '10px 12px', 
                background: 'rgba(255, 60, 90, 0.1)', 
                border: '1px solid var(--red)',
                borderRadius: 'var(--radius)',
                fontSize: 11,
                color: 'var(--red)'
              }}>
                {error}
              </div>
            )}

            {/* Name Field */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'var(--text)', 
                fontSize: 12, 
                fontWeight: 500,
                marginBottom: 8 
              }}>
                Your Name <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  transition: 'border-color 0.15s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Building Field (Optional) */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'var(--text)', 
                fontSize: 12, 
                fontWeight: 500,
                marginBottom: 8 
              }}>
                What are you building? <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={formData.building}
                onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                placeholder="e.g., ESP32 weather station, smart clock, game console..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  transition: 'border-color 0.15s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Improvements Field */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'var(--text)', 
                fontSize: 12, 
                fontWeight: 500,
                marginBottom: 8 
              }}>
                What could we improve?
              </label>
              <textarea
                value={formData.improvements}
                onChange={(e) => setFormData({ ...formData, improvements: e.target.value })}
                placeholder="Tell us what's confusing, broken, or could be better..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border-color 0.15s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Features Field */}
            <div>
              <label style={{ 
                display: 'block', 
                color: 'var(--text)', 
                fontSize: 12, 
                fontWeight: 500,
                marginBottom: 8 
              }}>
                What features would you like to see?
              </label>
              <textarea
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                placeholder="Color displays? More animations? Better preview? Tell us your ideas..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border-color 0.15s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSkip}
                className="btn-secondary"
                style={{ flex: 1 }}
                disabled={submitting}
              >
                Maybe Later
              </button>
              <button
                type="submit"
                className="btn-download"
                style={{ 
                  flex: 1,
                  borderColor: 'var(--green)',
                  color: 'var(--green)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    Submitting...
                  </>
                ) : (
                  <>
                    ✓ Submit Feedback
                  </>
                )}
              </button>
            </div>

            <div style={{ 
              textAlign: 'center', 
              fontSize: 10, 
              color: 'var(--text-ghost)',
              marginTop: 4
            }}>
              Your feedback is anonymous and helps us improve the tool for everyone.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
