import React from 'react';

const ProgressBar = ({ progress }) => {
  const progressStyle = progress === 100 ? "h-4 bg-green-500 rounded" : "h-2 bg-blue-500";
  return (
    <div className="w-full bg-gray-300 rounded">
      <div className={progressStyle} style={{ width: `${progress}%` }}></div>
    </div>
  );
};

export default ProgressBar;