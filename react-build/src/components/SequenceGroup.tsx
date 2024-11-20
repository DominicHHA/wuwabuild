import React from 'react';

interface SequenceGroupProps {
  characterName: string;
  isSpectro?: boolean;
  onSequenceChange: (sequence: number) => void;
  sequence: number;
}

export const SequenceGroup: React.FC<SequenceGroupProps> = ({ 
  characterName, 
  isSpectro,
  onSequenceChange,
  sequence 
}) => {
  const handleSequenceClick = (clickedSequence: number) => {
    const newSequence = clickedSequence === sequence 
      ? clickedSequence - 1 
      : clickedSequence;
    
    onSequenceChange(newSequence);
  };

  const displayName = characterName.startsWith('Rover') 
    ? `Rover${isSpectro ? 'Spectro' : 'Havoc'}`
    : characterName;

  return (
    <div className="sequence-group">
      <img 
        id="sequenceImage"
        src={`images/Wavebands/${displayName}.png`}
        alt=""
        className="sequence-image"
      />
      <div className="sequence-label">Sequence</div>
      {[1, 2, 3, 4, 5, 6].map((num) => (
        <div
          key={num}
          className={`sequence-option ${num <= sequence ? 'active' : ''}`}
          data-sequence={num}
          onClick={() => handleSequenceClick(num)}
        >
          {num}
        </div>
      ))}
    </div>
  );
};