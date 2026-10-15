import { useParams } from "react-router-dom";
import { AuthForm } from "@/features/auth/AuthForm";

const InviteSignup = () => {
  const { token } = useParams();
  return <AuthForm mode="signup" inviteToken={token} />;
};

export default InviteSignup;
