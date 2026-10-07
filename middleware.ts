import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/* Refresca la sesión y protege el sistema: sin sesión solo existe /login. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isLogin = pathname === "/login"

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ""
    const redirect = NextResponse.redirect(url)
    // Conserva las cookies de sesión que el refresco haya escrito
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  if (!user && !isLogin) {
    const redirect = redirectTo("/login")
    if (pathname !== "/") {
      const url = new URL(redirect.headers.get("location")!)
      url.searchParams.set("next", pathname + search)
      redirect.headers.set("location", url.toString())
    }
    return redirect
  }

  if (user && (isLogin || pathname === "/")) {
    return redirectTo("/dashboard")
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
