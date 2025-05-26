<script lang="ts">
	import '../styles/index.css';

	let { children } = $props();
</script>

<main class="flow content-grid">
	{@render children()}
</main>

<footer class="full-width">
	<div>
		Design by
		<a href="/" target="_blank" aria-label="logo">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="36"
				height="36"
				fill="none"
				viewBox="0 0 40 40"
			>
				<path
					fill="currentColor"
					d="M0 20C0 8.954 8.954 0 20 0c8.121 0 15.112 4.84 18.245 11.794l-26.45 26.45a20 20 0 0 1-3.225-1.83L24.984 20H20L5.858 34.142A19.94 19.94 0 0 1 0 20M39.999 20.007 20.006 40c11.04-.004 19.99-8.953 19.993-19.993"
				>
				</path>
			</svg>
		</a>
	</div>
</footer>

<style>
	main {
		min-height: 100vh; /* Ensures it takes up at least the full height of the viewport */
		display: flex;
		flex-direction: column;
	}
	footer {
		display: flex;
		justify-content: center;
		align-items: center;
		font-size: var(--font-size-base);
		padding: 18px 30px 16px;
		background: var(--ui-element-bg);
		color: var(--text-secondary);
		border-top: 1px solid var(--ui-border);

		& div {
			display: flex;
			justify-content: center;
			align-items: center;

			& a {
				margin-left: 10px;
				color: var(--text-primary);
				transition: color 0.3s ease;

				&:hover {
					color: var(--primary-accent);
				}

				/* SVG styling */
				& svg {
					color: inherit;
					transition: color 0.3s ease;
				}
			}
		}
	}

	@media (min-width: 768px) {
		footer {
			justify-content: flex-start; /* Align to the left on larger screens */
		}
	}
</style>
