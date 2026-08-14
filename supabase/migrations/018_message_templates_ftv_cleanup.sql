-- Deactivate legacy Enamor / verification templates not used by FTV.
-- Safe incremental: only touches known legacy ids; FTV defaults stay active.

update public.message_templates
set is_active = false,
    updated_at = now()
where id in (
  'instagram_verification',
  'whatsapp_verification',
  'survey_access',
  'enamor_referral',
  'apparel_referral'
);

notify pgrst, 'reload schema';
