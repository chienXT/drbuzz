/**
 * Format relative time in Vietnamese
 * @param {Date|string} date 
 * @returns {string}
 */
function formatRelativeTime(date) {
  if (!date) return '';
  const then = new Date(date);
  const now = new Date();
  const diffSecs = Math.floor((now - then) / 1000);

  if (diffSecs < 60) return 'Vừa xong';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} phút trước`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h trước`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks} tuần trước`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} tháng trước`;
  
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} năm trước`;
}

module.exports = { formatRelativeTime };
