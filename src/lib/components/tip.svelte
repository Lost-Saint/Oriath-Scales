<div class="how-it-works">
	<h2 class="section-title">How to Use</h2>
	<div class="steps">
		<div class="step">
			<div class="icon-circle">FILE</div>
			<div>
				<p class="step-description">
					Copy an item from Path of Exile (Ctrl+C while hovering over an item)
				</p>
			</div>
		</div>

		<div class="step">
			<div class="icon-circle">CHECK</div>
			<div>
				<p class="step-description">
					Paste it into the item checker textbox below
				</p>
			</div>
		</div>

		<div class="step">
			<div class="icon-circle">SEND</div>
			<div>
				<p class="step-description">
					Toggle whether you want to include item level in the search
				</p>
			</div>
		</div>

		<div class="step">
			<div class="icon-circle">DONE</div>
			<div>
				<p class="step-description">
					Click "Search on PoE Trade" to open the official trade site
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	.how-it-works {
		background-color: hsl(240, 5, 10);
		padding: 1.5rem;
		border-radius: 0.5rem;
		height: 100%;
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.step {
		display: flex;
		gap: 1rem;
	}

	.icon-circle {
		flex-shrink: 0;
		height: 2.5rem;
		width: 2.5rem;
		border-radius: 9999px;
		background-color: var(--color-primary-10);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.step-description {
		font-size: 0.875rem;
		color: var(--color-muted-foreground);
	}
</style>
