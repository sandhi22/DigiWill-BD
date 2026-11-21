import { useState } from 'react';
import { Copy01Icon, PrinterIcon } from '@hugeicons/core-free-icons';
import { useI18n } from '../i18n';
import { Button, Icon, Logo, Modal, useToast } from './ui';

export function LegacyCard({ owner, nominee, code, issued }) {
  const { t, date } = useI18n();
  return (
    <div className="legacy-card">
      <div className="card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--indigo)' }}>
          <Logo size={26} />
          <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, color: 'var(--ink)' }}>DigiWill BD</strong>
        </div>
        <span className="faint tiny">{t('card.issued', { date: date(issued) })}</span>
      </div>
      <p className="card-for">{t('card.for', { nominee, owner })}</p>
      <div className="card-code" role="group" aria-label={`${t('card.codeLabel')}: ${code}`}>
        {code.split('-').map((g, i) => <span key={i}>{g}</span>)}
      </div>
      <ol>
        <li>{t('card.step1', { owner })}</li>
        <li>{t('card.step2', { owner })}</li>
        <li>{t('card.step3')}</li>
      </ol>
    </div>
  );
}

/** Shown once, right after a card is generated. Cannot be dismissed by accident. */
export default function LegacyCardModal({ owner, nominee, card, onDone, reissued }) {
  const { t } = useI18n();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  return (
    <Modal title={reissued ? t('card.newTitle') : t('card.title')} footer={(
      <>
        <Button className="secondary" onClick={async () => { await navigator.clipboard.writeText(card.text); toast(t('common.copied')); }}>
          <Icon icon={Copy01Icon} size={18} />{t('card.copy')}
        </Button>
        <Button className="secondary" onClick={() => window.print()}><Icon icon={PrinterIcon} size={18} />{t('card.print')}</Button>
        <Button disabled={!saved} onClick={onDone}>{t('card.done')}</Button>
      </>
    )}>
      <p className="muted no-print">{t('card.intro', { nominee: nominee.name })}</p>
      <div className="print-area">
        <LegacyCard owner={owner} nominee={nominee.name} code={card.text} issued={new Date()} />
      </div>
      {reissued && <p className="small no-print" style={{ color: 'var(--marigold)' }}>{t('card.oldInvalid')}</p>}
      <label className={`check no-print${saved ? ' on' : ''}`}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span className="small">{t('card.ack')}</span>
      </label>
    </Modal>
  );
}
