import { redirect } from "next/navigation"

// La landing se retiró: la raíz lleva al sistema (el middleware manda al login si no hay sesión).
export default function Home() {
  redirect("/dashboard")
}
