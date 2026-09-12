"use server";
import { randomBytes } from "node:crypto";
import { db } from "@/services/drizzle";
import { authMagicLinks, users } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { formatAsSlug } from "../formatting";
import { createEmailMatchCondition } from "./email";
import { MAGIC_LINK_EXPIRES_IN_MINUTES, sendMagicLinkVerification } from "./magic-link-delivery";
import { sanitizeAuthRedirectTo } from "./redirect";
import { createSession, generateSessionToken, setSetSessionCookie } from "./session";
import {
	LoginSchema,
	SignUpWithEmailSchema,
	type TLogin,
	type TSignUpWithEmailSchema,
	type TVerifyMagicLinkCodeSchema,
	VerifyMagicLinkCodeSchema,
} from "./types";

type TLoginResult = {
	formError?: string;
	fieldError?: {
		[key in keyof TLogin]?: string;
	};
};
export async function login(_: TLoginResult, input: FormData): Promise<TLoginResult> {
	const data = {
		email: input.get("email") as string,
	};
	const redirectTo = sanitizeAuthRedirectTo(input.get("redirectTo"));
	console.log("[INFO] [LOGIN] Input data received", data);
	const validationParsed = LoginSchema.safeParse(data);
	if (!validationParsed.success) {
		const err = validationParsed.error.flatten();
		return {
			fieldError: {
				email: err.fieldErrors.email?.[0],
			},
		};
	}

	const { email } = validationParsed.data;

	const user = await db.query.users.findFirst({
		where: (fields) => createEmailMatchCondition(fields.email, email),
	});
	if (!user) {
		console.log("[ERROR] [LOGIN] User not found", email);
		return {
			formError: "Usuário ou senha incorretos.",
		};
	}
	// Bypassing the magic link for the demo user
	if (user.email === "demouser@meta.com") {
		const sessionToken = await generateSessionToken();
		const session = await createSession({
			token: sessionToken,
			userId: user.id,
		});
		console.log("SESSION CREATED", session);
		try {
			await setSetSessionCookie({
				token: sessionToken,
				expiresAt: session.dataExpiracao,
			});
		} catch (error) {
			console.log("ERROR", error);
			const errorMsg = "Um erro desconhecido ocorreu.";
			return {
				formError: errorMsg,
			};
		}
		return redirect(redirectTo);
	}

	// Creating magic link to send to the user
	const verificationToken = randomBytes(32).toString("hex");
	const verificationCode = Math.floor(100_000 + Math.random() * 900_000).toString(); // Gera código de 6 dígitos
	const insertedAuthMagicLinkResponse = await db
		.insert(authMagicLinks)
		.values({
			usuarioId: user.id,
			token: verificationToken,
			codigo: verificationCode,
			redirectTo,
			dataInsercao: dayjs().toDate(),
			dataExpiracao: dayjs().add(MAGIC_LINK_EXPIRES_IN_MINUTES, "minutes").toDate(),
		})
		.returning({ id: authMagicLinks.id });

	const insertedAuthMagicLinkId = insertedAuthMagicLinkResponse[0]?.id;
	if (!insertedAuthMagicLinkId) {
		return {
			formError: "Um erro desconhecido ocorreu.",
		};
	}
	console.log("[INFO] [LOGIN] Magic link created", {
		id: insertedAuthMagicLinkId,
		token: verificationToken,
		code: verificationCode,
	});
	const deliveryResponse = await sendMagicLinkVerification({
		email,
		phone: user.telefone,
		verificationToken,
		verificationCode,
		expiresInMinutes: MAGIC_LINK_EXPIRES_IN_MINUTES,
	});
	console.log("[INFO] [LOGIN] Magic link delivery sent", { deliveryResponse });
	return redirect(`/auth/magic-link?id=${insertedAuthMagicLinkId}`);
}

type TSignUpWithEmailResult = {
	formError?: string;
	fieldError?: {
		[key in keyof TSignUpWithEmailSchema]?: string;
	};
};
export async function signUpWithEmail(_: TSignUpWithEmailResult, input: FormData): Promise<TSignUpWithEmailResult> {
	const data = {
		nome: input.get("nome") as string,
		email: input.get("email") as string,
	};
	const redirectTo = sanitizeAuthRedirectTo(input.get("redirectTo"));

	console.log("[INFO] [SIGN UP WITH EMAIL] Input data received", data);
	const validationParsed = SignUpWithEmailSchema.safeParse(data);
	if (!validationParsed.success) {
		const err = validationParsed.error.flatten();
		return {
			fieldError: {
				nome: err.fieldErrors.nome?.[0],
				email: err.fieldErrors.email?.[0],
			},
		};
	}

	const { nome, email } = validationParsed.data;

	const existingUser = await db.query.users.findFirst({
		where: (fields) => createEmailMatchCondition(fields.email, email),
	});
	if (existingUser) {
		console.log("[ERROR] [SIGN UP WITH EMAIL] User attempts to sign up with an already existing email", existingUser);
		return {
			formError: "Usuário já existe.",
		};
	}

	const insertedUserResponse = await db
		.insert(users)
		.values({
			nome: nome,
			email: email,
			telefone: "",
			usuario: formatAsSlug(nome),
			senha: "",
			googleId: null,
			googleRefreshToken: null,
			googleAccessToken: null,
			dataNascimento: null,
			dataInsercao: dayjs().toDate(),
		})
		.returning({ id: users.id });

	const insertedUserId = insertedUserResponse[0]?.id;
	if (!insertedUserId) {
		console.log("[ERROR] [SIGN UP WITH EMAIL] User not created", data);
		return {
			formError: "Um erro desconhecido ocorreu.",
		};
	}
	console.log("[INFO] [SIGN UP WITH EMAIL] User created", {
		id: insertedUserId,
		email,
	});
	// Creating magic link
	const verificationToken = randomBytes(32).toString("hex");
	const verificationCode = Math.floor(100_000 + Math.random() * 900_000).toString(); // Gera código de 6 dígitos

	const insertedAuthMagicLinkResponse = await db
		.insert(authMagicLinks)
		.values({
			usuarioId: insertedUserId,
			token: verificationToken,
			codigo: verificationCode,
			redirectTo,
			dataInsercao: dayjs().toDate(),
			dataExpiracao: dayjs().add(MAGIC_LINK_EXPIRES_IN_MINUTES, "minutes").toDate(),
		})
		.returning({ id: authMagicLinks.id });

	const insertedAuthMagicLinkId = insertedAuthMagicLinkResponse[0]?.id;
	if (!insertedAuthMagicLinkId) {
		return {
			formError: "Um erro desconhecido ocorreu.",
		};
	}
	console.log("[INFO] [SIGN UP WITH EMAIL] Magic link created", {
		id: insertedAuthMagicLinkId,
		token: verificationToken,
		code: verificationCode,
	});
	const deliveryResponse = await sendMagicLinkVerification({
		email,
		phone: "",
		verificationToken,
		verificationCode,
		expiresInMinutes: MAGIC_LINK_EXPIRES_IN_MINUTES,
	});
	console.log("[INFO] [SIGN UP WITH EMAIL] Magic link delivery sent", deliveryResponse);
	return redirect(`/auth/magic-link?id=${insertedAuthMagicLinkId}`);
}
type TVerifyMagicLinkCodeResult = {
	formError?: string;
	fieldError?: {
		[key in keyof TVerifyMagicLinkCodeSchema]?: string;
	};
};
export async function verifyMagicLinkCode(_: TVerifyMagicLinkCodeResult, input: TVerifyMagicLinkCodeSchema): Promise<TVerifyMagicLinkCodeResult> {
	const validationParsed = VerifyMagicLinkCodeSchema.safeParse(input);
	if (!validationParsed.success) {
		const err = validationParsed.error.flatten();
		return {
			fieldError: {
				code: err.fieldErrors.code?.[0],
				verificationTokenId: err.fieldErrors.verificationTokenId?.[0],
			},
		};
	}

	const { code, verificationTokenId } = validationParsed.data;

	const magicLink = await db.query.authMagicLinks.findFirst({
		where: (fields, { eq }) => eq(fields.id, verificationTokenId),
	});
	if (!magicLink) {
		return {
			formError: "Código de verificação inválido.",
		};
	}
	// Checking if the magic link is expired
	const now = dayjs();
	const expirationDate = dayjs(magicLink.dataExpiracao);
	if (now.isAfter(expirationDate)) {
		return {
			formError: "Código expirado.",
		};
	}

	// Checking if the code is correct
	if (magicLink.codigo !== code) {
		return {
			formError: "Código de verificação incorreto.",
		};
	}

	// Deleting the magic link
	await db.delete(authMagicLinks).where(eq(authMagicLinks.id, verificationTokenId));
	// Creating the new session
	const sessionToken = await generateSessionToken();
	const session = await createSession({
		token: sessionToken,
		userId: magicLink.usuarioId,
	});

	try {
		await setSetSessionCookie({
			token: sessionToken,
			expiresAt: session.dataExpiracao,
		});
	} catch (error) {
		console.log("[ERROR] [VERIFY MAGIC LINK CODE] Error setting session cookie", error);
		const errorMsg = "Um erro desconhecido ocorreu.";
		return {
			formError: errorMsg,
		};
	}
	redirect(sanitizeAuthRedirectTo(magicLink.redirectTo));
}

export async function getMagicLinkById(id: string) {
	try {
		const magicLink = await db.query.authMagicLinks.findFirst({
			where: (fields, { eq }) => eq(fields.id, id),
			with: {
				usuario: {
					columns: {
						email: true,
					},
				},
			},
		});
		if (!magicLink) return null;

		const isExpired = new Date().getTime() > new Date(magicLink.dataExpiracao).getTime();

		if (isExpired) return null;

		return {
			id: magicLink.id,
			usuarioId: magicLink.usuarioId,
			usuarioEmail: magicLink.usuario.email,
			dataExpiracao: magicLink.dataExpiracao,
		};
	} catch (error) {
		console.log("Error getting the magic link by id", error);
		throw error;
	}
}
