let DOMPurify;

// Dynamic import for DOMPurify - use browser version in browser, isomorphic version in Node
if (typeof window !== 'undefined') {
  // Browser environment
  import('dompurify').then(module => {
    DOMPurify = module.default;
  });
} else {
  // Node environment - use a simple HTML sanitizer for testing
  DOMPurify = {
    sanitize: (input) => {
      if (typeof input !== 'string') return String(input);
      
      // Basic XSS protection - remove script tags and dangerous attributes
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/onerror\s*=\s*["'][^"']*["']/gi, '')
        .replace(/onclick\s*=\s*["'][^"']*["']/gi, '');
    }
  };
}

export const validators = {
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  phone: (value) => {
    const phoneRegex = /^[0-9-+\s()]+$/;
    return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10;
  },
  
  postalCode: (value) => {
    const postalRegex = /^\d{3}-\d{4}$/;
    return postalRegex.test(value);
  },
  
  required: (value) => {
    return value !== null && value !== undefined && value.toString().trim() !== '';
  }
};

export const sanitize = async (input) => {
  // For browser, wait for DOMPurify to load
  if (typeof window !== 'undefined' && !DOMPurify) {
    const module = await import('dompurify');
    DOMPurify = module.default;
    return DOMPurify.sanitize(input);
  }
  
  return DOMPurify ? DOMPurify.sanitize(input) : input;
};

export const validateAndSanitize = async (value, validationType) => {
  const sanitized = await sanitize(value);
  const isValid = validators[validationType] ? validators[validationType](sanitized) : true;
  
  return { value: sanitized, isValid, error: isValid ? null : `Invalid ${validationType}` };
};