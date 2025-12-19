// UI Harmony System - All styling rules in one place

// COLORS
export const COLORS = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: '#e5edff',
  
  text: {
    heading: '#0f172a',
    body: '#1f2937',
    muted: '#334155',
    light: '#475569',
    lighter: '#94a3b8'
  },
  
  status: {
    new: '#16a34a',
    inProgress: '#2563eb',
    prepared: '#f59e0b',
    finalized: '#7c3aed',
    canceled: '#ef4444',
    returned: '#475569'
  },
  
  actions: {
    edit: '#2563eb',
    editBorder: 'rgba(37, 99, 235, 0.35)',
    editHover: 'rgba(37, 99, 235, 0.08)',
    delete: '#ef4444',
    deleteBorder: 'rgba(239, 68, 68, 0.35)',
    deleteHover: 'rgba(239, 68, 68, 0.08)'
  },
  
  white: 'white',
  transparent: 'transparent',
  border: '#e2e8f0',
  surface: '#f8fafc'
};

// GRADIENTS
export const GRADIENTS = {
  primary: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  hover: 'linear-gradient(135deg, rgba(15, 23, 42, 0.04) 0%, rgba(15, 23, 42, 0.08) 100%)',
  background: 'linear-gradient(180deg, #f8fafc 0%, #edf2ff 60%, #f8fafc 100%)'
};

// SPACING
export const SPACING = {
  xs: 2,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24
};

// BORDER RADIUS
export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12
};

// SHADOWS
export const SHADOWS = {
  card: '0 1px 3px rgba(15, 23, 42, 0.05)',
  button: '0 1px 2px rgba(37, 99, 235, 0.12)',
  buttonHover: '0 2px 4px rgba(37, 99, 235, 0.2)',
  buttonPrimary: '0 1px 3px rgba(37, 99, 235, 0.15)',
  subtle: '0 1px 2px rgba(15, 23, 42, 0.05)'
};

// TYPOGRAPHY
export const TYPOGRAPHY = {
  heading: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: COLORS.text.heading
  },
  body: {
    fontSize: '15px',
    fontWeight: 500,
    color: COLORS.text.body
  },
  muted: {
    fontSize: '13px',
    color: COLORS.text.light
  },
  bold: {
    fontWeight: 600
  }
};

// CARD STYLES
export const CARD_STYLES = {
  base: {
    boxShadow: SHADOWS.card,
    borderRadius: RADIUS.lg,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.white
  },
  head: {
    borderBottom: `1px solid ${COLORS.border}`,
    padding: `${SPACING.md}px ${SPACING.lg}px`
  },
  body: {
    padding: `${SPACING.lg}px`
  }
};

// BUTTON STYLES
export const BUTTON_STYLES = {
  primary: {
    background: GRADIENTS.primary,
    border: 'none',
    borderRadius: RADIUS.md,
    fontWeight: TYPOGRAPHY.bold.fontWeight,
    padding: '4px 14px',
    height: 'auto',
    boxShadow: SHADOWS.buttonPrimary,
    transition: 'all 0.2s ease'
  },
  
  secondary: {
    borderRadius: RADIUS.md,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.bold.fontWeight,
    padding: '4px 12px',
    height: 'auto',
    boxShadow: 'none'
  },
  
  edit: {
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.actions.editBorder}`,
    color: COLORS.actions.edit,
    fontWeight: 500,
    transition: 'all 0.2s ease'
  },
  
  delete: {
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.actions.deleteBorder}`,
    fontWeight: 500,
    transition: 'all 0.2s ease'
  },
  
  modal: {
    ok: {
      background: GRADIENTS.primary,
      border: 'none',
      borderRadius: RADIUS.md,
      fontWeight: TYPOGRAPHY.bold.fontWeight,
      height: 40,
      padding: '0 24px',
      boxShadow: SHADOWS.buttonPrimary
    },
    cancel: {
      borderRadius: RADIUS.md,
      fontWeight: TYPOGRAPHY.bold.fontWeight,
      height: 40,
      padding: '0 24px',
      border: '1px solid #d1d5db'
    }
  }
};

// TAG STYLES
export const TAG_STYLES = {
  gradient: {
    padding: '6px 16px',
    borderRadius: RADIUS.md,
    background: GRADIENTS.primary,
    color: COLORS.white,
    fontSize: '14px',
    fontWeight: 700,
    border: 'none'
  },
  
  status: {
    fontSize: '13px',
    padding: '4px 12px'
  },
  
  platform: {
    padding: '4px 12px',
    borderRadius: RADIUS.sm,
    background: GRADIENTS.primary,
    color: COLORS.white,
    fontSize: '13px',
    fontWeight: TYPOGRAPHY.bold.fontWeight
  },
  
  quantity: {
    padding: '6px 16px',
    borderRadius: RADIUS.md,
    background: GRADIENTS.primary,
    color: COLORS.white,
    fontSize: '14px',
    fontWeight: 700,
    border: 'none'
  }
};

// TABLE CONFIGURATION
export const TABLE_CONFIG = {
  // Column header styling
  headerStyle: {
    fontWeight: TYPOGRAPHY.bold.fontWeight,
    color: COLORS.text.muted
  },
  
  // Row interaction
  rowProps: (clickable = false) => ({
    style: { cursor: clickable ? 'pointer' : 'default' },
    onMouseEnter: (e) => {
      e.currentTarget.style.background = GRADIENTS.hover;
      e.currentTarget.style.transition = 'all 0.2s ease';
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.background = COLORS.white;
    }
  }),
  
  // Table container
  tableStyle: {
    marginTop: 0,
    minHeight: '360px'
  },
  
  // Pagination
  pagination: (pageSize = 20) => ({
    pageSize,
    showTotal: (total, [start, end]) => `${start}-${end} of ${total}`,
    style: { marginTop: 0 }
  }),
  
  // Empty state
  locale: {
    emptyText: 'No data'
  },
  
  // Row class
  rowClassName: 'modern-row'
};

// TAB STYLES (CSS-in-JS)
export const TAB_CSS = `
  .harmony-tabs { margin: 0 !important; padding: 0 !important; }
  .harmony-tabs .ant-tabs-nav { 
    margin-top: 0 !important; 
    padding: 4px 0 12px 0 !important;
    background: transparent !important;
    border-bottom: none !important;
  }
  .harmony-tabs .ant-tabs-content-holder { margin-top: 0 !important; padding-top: 0 !important; }
  .harmony-tabs .ant-tabs-nav::before { display: none !important; }
  .harmony-tabs .ant-tabs-tab {
    padding: 0 !important;
    margin-right: 12px !important;
    background: transparent !important;
  }
  .harmony-tabs .ant-tabs-tab .ant-tabs-tab-btn {
    padding: 10px 16px !important;
    border-radius: 10px !important;
    transition: all 0.2s ease !important;
    color: ${COLORS.text.light} !important;
    font-weight: 600 !important;
    font-size: 14px !important;
    background: ${COLORS.primaryLight} !important;
    border: 1px solid ${COLORS.border} !important;
  }
  .harmony-tabs .ant-tabs-tab:hover .ant-tabs-tab-btn {
    color: ${COLORS.primary} !important;
    border-color: ${COLORS.primary} !important;
    background: ${COLORS.white} !important;
  }
  .harmony-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
    color: ${COLORS.primary} !important;
    background: ${COLORS.white} !important;
    box-shadow: ${SHADOWS.subtle} !important;
    border: 1px solid ${COLORS.primary} !important;
  }
  .harmony-tabs .ant-tabs-ink-bar { display: none !important; }
`;

// MODAL STYLES
export const MODAL_STYLES = {
  width: 600,
  bodyStyle: { padding: SPACING.xxl },
  titleStyle: { 
    fontSize: '20px', 
    fontWeight: 'bold', 
    color: COLORS.text.heading 
  }
};

// INPUT STYLES
export const INPUT_STYLES = {
  base: {
    borderRadius: RADIUS.md,
    height: 40,
    border: '1px solid #d1d5db',
    transition: 'all 0.2s ease'
  },
  label: {
    fontWeight: TYPOGRAPHY.bold.fontWeight,
    color: COLORS.text.muted
  }
};

export const getStatusColor = (status) => {
  const statusMap = {
    'new': COLORS.status.new,
    'in progress': COLORS.status.inProgress,
    'prepared': COLORS.status.prepared,
    'finalized': COLORS.status.finalized,
    'canceled': COLORS.status.canceled,
    'returned': COLORS.status.returned
  };
  return statusMap[status?.toLowerCase()] || 'default';
};

export const formatDate = (date) => {
  return date ? new Date(date).toLocaleString('ro-RO') : 'N/A';
};

export const createColumnHeader = (text) => ({
  title: text
});

export const createButtonHover = (hoverBg, hoverBorder) => ({
  onMouseEnter: (e) => {
    e.currentTarget.style.background = hoverBg;
    if (hoverBorder) e.currentTarget.style.borderColor = hoverBorder;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.background = COLORS.transparent;
    if (hoverBorder) e.currentTarget.style.borderColor = hoverBorder.replace('1)', '0.4)');
  }
});

export const createPrimaryButtonHover = () => ({
  onMouseEnter: (e) => {
    e.currentTarget.style.transform = 'translateY(-2px)';
    e.currentTarget.style.boxShadow = SHADOWS.buttonHover;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = SHADOWS.buttonPrimary;
  }
});
