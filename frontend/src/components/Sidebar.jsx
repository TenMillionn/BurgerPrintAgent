import { motion } from 'framer-motion';
import {
  PanelLeftClose,
  MessageSquarePlus,
  Globe,
  LogOut,
  Sun,
  Moon,
  Pencil,
  Trash2,
  BookOpen,
  Users,
} from 'lucide-react';
import { useTranslation } from '../i18n';

export default function Sidebar({
  collapsed,
  onToggle,
  onNewChat,
  onLogout,
  userName,
  userEmail,
  theme,
  onToggleTheme,
  conversations = [],
  activeId,
  onSelect,
  onRename,
  onDelete,
  isAdmin = false,
  onOpenKnowledge,
  onOpenUsers,
}) {
  const { t, locale, setLocale } = useTranslation();

  return (
    <motion.aside
      className="sidebar"
      animate={{ width: collapsed ? 0 : 260 }}
      transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="sidebar-inner" style={{ width: 260 }}>
        {/* Header */}
        <div className="sidebar-header">
          <img src="./favicon.png" alt="" className="sidebar-brand-icon" />
          <span className="sidebar-brand-text">BurgerPrint Agent</span>
          <button
            className="sidebar-toggle"
            onClick={onToggle}
            title={t('sidebar.collapse')}
          >
            <PanelLeftClose size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* New chat */}
        <nav className="sidebar-nav">
          <button className="sidebar-item" onClick={onNewChat}>
            <MessageSquarePlus size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            <span className="sidebar-item-label">{t('sidebar.newChat')}</span>
          </button>
          {isAdmin && (
            <button className="sidebar-item" onClick={onOpenKnowledge}>
              <BookOpen size={19} strokeWidth={1.8} className="sidebar-item-icon" />
              <span className="sidebar-item-label">{t('knowledge.open')}</span>
            </button>
          )}
          {isAdmin && (
            <button className="sidebar-item" onClick={onOpenUsers}>
              <Users size={19} strokeWidth={1.8} className="sidebar-item-icon" />
              <span className="sidebar-item-label">{t('users.open')}</span>
            </button>
          )}
        </nav>

        {/* Conversation history */}
        <div className="sidebar-history">
          <div className="sidebar-history-label">{t('sidebar.history')}</div>
          <div className="sidebar-history-list">
            {conversations.length === 0 && (
              <div className="sidebar-history-empty">{t('sidebar.noConversations')}</div>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={'sidebar-convo' + (c.id === activeId ? ' is-active' : '')}
                onClick={() => onSelect && onSelect(c.id)}
                title={c.title}
              >
                <span className="sidebar-convo-title">{c.title || t('sidebar.untitled')}</span>
                <span className="sidebar-convo-actions">
                  <button
                    className="sidebar-convo-btn"
                    title={t('sidebar.rename')}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = window.prompt(t('sidebar.rename'), c.title || '');
                      if (next != null) onRename && onRename(c.id, next);
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    className="sidebar-convo-btn"
                    title={t('sidebar.delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(t('sidebar.deleteConfirm'))) onDelete && onDelete(c.id);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom actions: Theme + Language */}
        <div className="sidebar-bottom-actions">
          {/* Theme toggle */}
          <button
            className="sidebar-item"
            onClick={onToggleTheme}
            title={t('theme.label')}
          >
            {theme === 'dark' ? (
              <Sun size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            ) : (
              <Moon size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            )}
            <span className="sidebar-item-label">
              {theme === 'dark' ? t('theme.light') : t('theme.dark')}
            </span>
          </button>

          {/* Language toggle */}
          <button
            className="sidebar-item"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            title={t('lang.label')}
          >
            <Globe size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            <span className="sidebar-item-label">
              {locale === 'vi' ? '🇻🇳 Tiếng Việt' : '🇺🇸 English'}
            </span>
          </button>
        </div>

        {/* User Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName || t('user.guest')}</div>
            {userEmail && (
              <div className="sidebar-user-email">{userEmail}</div>
            )}
          </div>
          {onLogout && (
            <button className="sidebar-logout" onClick={onLogout} title={t('user.logout')}>
              <LogOut size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
