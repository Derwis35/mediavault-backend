export class AuthResponseDto {
  accessToken!: string;
  user!: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: { name: string };
  };
  expiresIn!: number;
}
