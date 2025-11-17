/**
 * Seed Configuration
 * Environment-specific settings for data seeding
 */

export const seedConfigs = {
  development: {
    locale: 'ja',
    batchSize: 100,
    verbose: true,
    quantity: {
      users: 100,
      products: 200,
      buyback_applications: 50,
      sales_orders: 100,
      antiquities_ledger: 30,
      inventory_movements: 500,
      reviews: 150
    },
    features: {
      generateFakeEmails: true,
      useRealImages: false,
      generateRelationships: true,
      seedAnalytics: true,
      seedTestAccounts: true,
      generateTransactionHistory: true
    },
    dataPatterns: {
      userDistribution: {
        customer: 0.7,
        staff: 0.2,
        manager: 0.08,
        admin: 0.02
      },
      productConditionDistribution: {
        S: 0.1,
        A: 0.25,
        B: 0.35,
        C: 0.25,
        D: 0.05
      },
      transactionStatusDistribution: {
        completed: 0.6,
        pending: 0.2,
        processing: 0.1,
        cancelled: 0.05,
        refunded: 0.05
      }
    }
  },
  
  staging: {
    locale: 'ja',
    batchSize: 50,
    verbose: false,
    quantity: {
      users: 20,
      products: 50,
      buyback_applications: 20,
      sales_orders: 30,
      antiquities_ledger: 15,
      inventory_movements: 100,
      reviews: 50
    },
    features: {
      generateFakeEmails: false,
      useRealImages: false,
      generateRelationships: true,
      seedAnalytics: true,
      seedTestAccounts: false,
      generateTransactionHistory: true
    },
    dataPatterns: {
      userDistribution: {
        customer: 0.8,
        staff: 0.15,
        manager: 0.04,
        admin: 0.01
      },
      productConditionDistribution: {
        S: 0.15,
        A: 0.3,
        B: 0.35,
        C: 0.15,
        D: 0.05
      },
      transactionStatusDistribution: {
        completed: 0.7,
        pending: 0.15,
        processing: 0.1,
        cancelled: 0.03,
        refunded: 0.02
      }
    }
  },
  
  production: {
    locale: 'ja',
    batchSize: 10,
    verbose: false,
    quantity: {
      users: 1, // Admin only
      products: 0,
      buyback_applications: 0,
      sales_orders: 0,
      antiquities_ledger: 0,
      inventory_movements: 0,
      reviews: 0
    },
    features: {
      generateFakeEmails: false,
      useRealImages: false,
      generateRelationships: false,
      seedAnalytics: false,
      seedTestAccounts: false,
      generateTransactionHistory: false
    },
    dataPatterns: {
      userDistribution: {
        admin: 1.0
      },
      productConditionDistribution: {},
      transactionStatusDistribution: {}
    }
  },
  
  test: {
    locale: 'ja',
    batchSize: 10,
    verbose: false,
    quantity: {
      users: 10,
      products: 20,
      buyback_applications: 10,
      sales_orders: 15,
      antiquities_ledger: 5,
      inventory_movements: 50,
      reviews: 20
    },
    features: {
      generateFakeEmails: true,
      useRealImages: false,
      generateRelationships: true,
      seedAnalytics: false,
      seedTestAccounts: true,
      generateTransactionHistory: true
    },
    dataPatterns: {
      userDistribution: {
        customer: 0.6,
        staff: 0.3,
        manager: 0.08,
        admin: 0.02
      },
      productConditionDistribution: {
        S: 0.2,
        A: 0.3,
        B: 0.3,
        C: 0.15,
        D: 0.05
      },
      transactionStatusDistribution: {
        completed: 0.5,
        pending: 0.2,
        processing: 0.15,
        cancelled: 0.1,
        refunded: 0.05
      }
    }
  }
};

/**
 * Get configuration for specific environment
 */
export function getConfig(environment) {
  return seedConfigs[environment] || seedConfigs.development;
}

/**
 * Merge custom configuration with defaults
 */
export function mergeConfig(environment, customConfig) {
  const baseConfig = getConfig(environment);
  
  return {
    ...baseConfig,
    ...customConfig,
    quantity: {
      ...baseConfig.quantity,
      ...customConfig.quantity
    },
    features: {
      ...baseConfig.features,
      ...customConfig.features
    },
    dataPatterns: {
      ...baseConfig.dataPatterns,
      ...customConfig.dataPatterns
    }
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config) {
  const errors = [];
  
  // Check required fields
  if (!config.locale) {
    errors.push('locale is required');
  }
  
  if (!config.batchSize || config.batchSize < 1) {
    errors.push('batchSize must be at least 1');
  }
  
  // Check quantities are non-negative
  if (config.quantity) {
    Object.entries(config.quantity).forEach(([key, value]) => {
      if (value < 0) {
        errors.push(`quantity.${key} must be non-negative`);
      }
    });
  }
  
  // Check distributions sum to 1
  if (config.dataPatterns) {
    Object.entries(config.dataPatterns).forEach(([pattern, distribution]) => {
      if (typeof distribution === 'object') {
        const sum = Object.values(distribution).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1.0) > 0.01 && Object.keys(distribution).length > 0) {
          errors.push(`${pattern} distribution must sum to 1.0 (current: ${sum})`);
        }
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  seedConfigs,
  getConfig,
  mergeConfig,
  validateConfig
};