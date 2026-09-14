-- Gatilho de campanha de promoção de produtos (docs/product-promotion-campaign-design.md).
-- Enum separado para que o PostgreSQL confirme o novo valor antes de qualquer uso
-- (ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação que o insere).
ALTER TYPE "campaign_trigger_type" ADD VALUE IF NOT EXISTS 'PROMOCAO-PRODUTOS';
