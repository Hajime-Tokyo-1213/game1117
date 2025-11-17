/**
 * LocalStorage Data Extractor
 * Extracts and manages localStorage data for migration to Supabase
 */

import { useState } from 'react';

export class LocalStorageExtractor {
  constructor() {
    this.STORAGE_KEYS = [
      'users',
      'currentUser',
      'inventory',
      'buybackRequests', 
      'salesData',
      'antiquitiesLedger',
      'priceData',
      'settings',
      'cache'
    ];
  }

  extract() {
    const data = {
      metadata: {
        exportedAt: new Date().toISOString(),
        source: 'localStorage',
        version: '1.0.0',
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    };

    this.STORAGE_KEYS.forEach(key => {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          data[key] = JSON.parse(item);
        }
      } catch (error) {
        console.warn(`Failed to parse localStorage key: ${key}`, error);
        data[key] = localStorage.getItem(key); // Store as raw data
      }
    });

    // Calculate statistics
    data.metadata.statistics = this.calculateStatistics(data);

    return data;
  }

  async exportToFile(filename = 'localStorage-export.json') {
    const data = this.extract();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async exportToSupabase(options = {}) {
    const data = this.extract();
    
    try {
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({ data, options })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Migration failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Migration to Supabase failed:', error);
      throw error;
    }
  }

  validateData() {
    const data = this.extract();
    const issues = [];

    // Check for required data structures
    if (data.users && !Array.isArray(data.users)) {
      issues.push('users data is not an array');
    }

    if (data.inventory && !Array.isArray(data.inventory)) {
      issues.push('inventory data is not an array');
    }

    if (data.buybackRequests && !Array.isArray(data.buybackRequests)) {
      issues.push('buybackRequests data is not an array');
    }

    // Validate user data structure
    if (data.users) {
      data.users.forEach((user, index) => {
        if (!user.email) {
          issues.push(`User at index ${index} missing email`);
        }
        if (!user.name) {
          issues.push(`User at index ${index} missing name`);
        }
      });
    }

    // Validate inventory data structure
    if (data.inventory) {
      data.inventory.forEach((item, index) => {
        if (!item.name) {
          issues.push(`Inventory item at index ${index} missing name`);
        }
        if (typeof item.sellingPrice !== 'number') {
          issues.push(`Inventory item at index ${index} invalid sellingPrice`);
        }
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
      data
    };
  }

  clearAll() {
    if (confirm('これにより全てのローカルデータが削除されます。続行しますか？')) {
      this.STORAGE_KEYS.forEach(key => {
        localStorage.removeItem(key);
      });
      console.log('LocalStorage cleared');
      return true;
    }
    return false;
  }

  backup() {
    const data = this.extract();
    const backup = {
      ...data,
      metadata: {
        ...data.metadata,
        type: 'backup',
        backupId: Date.now().toString()
      }
    };
    
    localStorage.setItem('__backup__', JSON.stringify(backup));
    return backup.metadata.backupId;
  }

  restore(backupId) {
    try {
      const backup = JSON.parse(localStorage.getItem('__backup__'));
      
      if (!backup || backup.metadata.backupId !== backupId) {
        throw new Error('Backup not found');
      }

      this.STORAGE_KEYS.forEach(key => {
        if (backup[key]) {
          localStorage.setItem(key, JSON.stringify(backup[key]));
        }
      });

      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      return false;
    }
  }

  private calculateStatistics(data) {
    const stats = {
      users: data.users?.length || 0,
      products: data.inventory?.length || 0,
      buybackRequests: data.buybackRequests?.length || 0,
      sales: data.salesData?.length || 0,
      ledgerEntries: data.antiquitiesLedger?.length || 0,
      totalSize: 0
    };

    // Calculate total data size
    try {
      stats.totalSize = new Blob([JSON.stringify(data)]).size;
    } catch {
      stats.totalSize = JSON.stringify(data).length;
    }

    return stats;
  }

  getStorageUsage() {
    const usage = {};
    let totalSize = 0;

    this.STORAGE_KEYS.forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        const size = new Blob([item]).size;
        usage[key] = {
          size,
          sizeFormatted: this.formatBytes(size),
          records: this.countRecords(item)
        };
        totalSize += size;
      }
    });

    usage.total = {
      size: totalSize,
      sizeFormatted: this.formatBytes(totalSize)
    };

    return usage;
  }

  private formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private countRecords(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data)) {
        return data.length;
      }
      return Object.keys(data).length;
    } catch {
      return 0;
    }
  }
}

// React Hook for migration management
export function useMigration() {
  const [status, setStatus] = useState('idle'); // idle, running, completed, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const startMigration = async (options = {}) => {
    setStatus('running');
    setProgress(0);
    setError(null);
    setResults(null);
    
    try {
      const extractor = new LocalStorageExtractor();
      
      // Validate data first
      const validation = extractor.validateData();
      if (!validation.isValid && !options.ignoreValidation) {
        throw new Error(`Data validation failed: ${validation.issues.join(', ')}`);
      }

      setProgress(20);

      // Export to Supabase
      const migrationResults = await extractor.exportToSupabase(options);
      
      setProgress(80);
      
      // Optional: Clear localStorage after successful migration
      if (options.clearAfterMigration && migrationResults.success) {
        extractor.clearAll();
      }
      
      setProgress(100);
      setStatus('completed');
      setResults(migrationResults);
      
    } catch (err) {
      setStatus('error');
      setError(err);
      console.error('Migration failed:', err);
    }
  };

  const exportData = async () => {
    try {
      const extractor = new LocalStorageExtractor();
      await extractor.exportToFile();
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  };

  const validateData = () => {
    const extractor = new LocalStorageExtractor();
    return extractor.validateData();
  };

  const getStorageInfo = () => {
    const extractor = new LocalStorageExtractor();
    return {
      usage: extractor.getStorageUsage(),
      statistics: extractor.calculateStatistics(extractor.extract())
    };
  };

  const reset = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setResults(null);
  };

  return { 
    status, 
    progress, 
    error, 
    results,
    startMigration, 
    exportData,
    validateData,
    getStorageInfo,
    reset
  };
}

export default LocalStorageExtractor;