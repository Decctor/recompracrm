import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { getStripeClient, resolveStripeAccount } from "@/services/stripe";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function generateBillingPortalRoute(_request: NextRequest) {
  const session = await getCurrentSessionUncached();
  if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

  const userOrgId = session.membership?.organizacao.id;
  if (!userOrgId)
    throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

  const organization = await db.query.organizations.findFirst({
    where: (fields, { eq }) => eq(fields.id, userOrgId),
  });
  if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

  if (!organization.stripeCustomerId)
    throw new createHttpError.BadRequest("Esta organização ainda não possui um cadastro de cobrança no Stripe.");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // O portal abre na conta dona do customer: assinante antigo troca plano e cartão na SYNCRONIZA.
  const stripe = getStripeClient(resolveStripeAccount(organization.stripeConta));
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${baseUrl}/dashboard/settings?tab=subscription`,
  });

  return NextResponse.json({
    data: {
      portalUrl: portalSession.url,
    },
    message: "Portal de cobrança criado com sucesso.",
  });
}

export type TBillingPortalOutput = {
  data: {
    portalUrl: string;
  };
  message: string;
};

export const POST = appApiHandler({
  POST: generateBillingPortalRoute,
});
