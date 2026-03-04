"use client";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { login } from "@/lib/authentication/actions";
import RecompraCRMLogo from "@/utils/svgs/logos/RECOMPRA - COMPLETE - VERTICAL - COLORFUL.svg";
import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { FaGoogle } from "react-icons/fa6";
function SignInPage() {
	const [actionResult, actionMethod] = useActionState(login, {});

	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm md:max-w-4xl">
				<div className="flex flex-col gap-6">
					<Card className="overflow-hidden p-0">
						<CardContent className="grid p-0 md:grid-cols-2">
							<form
								action={async (formData) => {
									captureClientEvent({
										event: "signin_started",
										properties: {
											auth_method: "email",
										},
									});
									return actionMethod(formData);
								}}
								className="p-6 py-8 md:py-10 md:p-8"
							>
								<FieldGroup>
									<div className="flex flex-col items-center gap-2 text-center mb-4">
										<h1 className="text-3xl font-semibold tracking-tight text-foreground">Bem-vindo de volta</h1>
										<p className="text-sm text-muted-foreground">Acesse sua conta para gerenciar suas operações</p>
									</div>
									<Field>
										<FieldLabel htmlFor="email">Email</FieldLabel>
										<Input id="email" name="email" type="email" placeholder="m@example.com" required />
									</Field>

									<Field>
										<Button type="submit" className="bg-[#24549C] hover:bg-[#1e4682] text-white">
											Acessar com Email
										</Button>
									</Field>
									{actionResult.formError ? (
										<FieldDescription className="text-center text-red-500">{actionResult.formError}</FieldDescription>
									) : actionResult.fieldError ? (
										<FieldDescription className="text-center text-red-500">{actionResult.fieldError.email}</FieldDescription>
									) : null}
									<FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Ou continue com</FieldSeparator>
									<Field className="w-full">
										<Button variant="outline" type="button" className="w-full flex items-center gap-3" asChild>
											<Link href="/auth/google" prefetch={false}>
												<FaGoogle className="w-4 h-4" />

												<span>Acessar com Google</span>
											</Link>
										</Button>
									</Field>
									<FieldDescription className="text-center">
										Não tem uma conta? <a href="/auth/signup">Cadastre-se</a>
									</FieldDescription>
								</FieldGroup>
							</form>
							<div className="bg-[#24549C] relative hidden md:block">
								<Image src={RecompraCRMLogo} alt="Logo da RecompraCRM" fill className="p-12" />
							</div>
						</CardContent>
					</Card>
					<FieldDescription className="px-6 text-center">
						Ao continuar, você concorda com nossos <a href="/legal">Termos de Serviço</a> e <a href="/legal">Política de Privacidade</a>.
					</FieldDescription>
				</div>
			</div>
		</div>
	);
}

export default SignInPage;
